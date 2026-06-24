import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateServiceAgreementPdf } from "@/lib/service-agreement-pdf";
import { notifyAgreementSigned } from "@/lib/notifications";
import type { OrgType } from "@/types/enums";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { organizationId?: string };
    const organizationId = body.organizationId?.trim();
    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId required" },
        { status: 400 },
      );
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("compliance_docs")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("doc_type", "agreement")
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Service agreement already on file", docId: existing.id },
        { status: 409 },
      );
    }

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select(
        "id, name, org_type, address, city, pincode, registration_number, pan, gstin, signatory_name, signatory_designation, contact_name, contact_phone, contact_email",
      )
      .eq("id", organizationId)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const missing: string[] = [];
    if (!org.registration_number?.trim()) missing.push("registration number");
    if (!org.pan?.trim()) missing.push("PAN");
    if (!org.gstin?.trim()) missing.push("GSTIN");
    if (!org.signatory_name?.trim()) missing.push("signatory name");
    if (!org.signatory_designation?.trim()) missing.push("signatory designation");
    if (!org.contact_name?.trim()) missing.push("coordinator name");
    if (!org.contact_phone?.trim()) missing.push("coordinator phone");
    if (!org.contact_email?.trim()) missing.push("contact email");

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const signedAt = new Date();
    const acceptedByEmail = user.email ?? org.contact_email ?? "unknown";

    const pdfBuffer = generateServiceAgreementPdf(
      {
        ...org,
        org_type: org.org_type as OrgType,
      },
      acceptedByEmail,
      signedAt,
    );

    const timestamp = signedAt.toISOString().replace(/[:.]/g, "-");
    const filePath = `${organizationId}/service-agreement-${timestamp}.pdf`;

    const { error: uploadError } = await admin.storage
      .from("compliance-docs")
      .upload(filePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("[sign-service-agreement] upload failed", uploadError);
      return NextResponse.json(
        { error: "Failed to store agreement PDF" },
        { status: 500 },
      );
    }

    const { data: docRow, error: insertError } = await admin
      .from("compliance_docs")
      .insert({
        organization_id: organizationId,
        doc_type: "agreement",
        file_url: filePath,
        metadata: {
          signed_by: user.id,
          signed_at: signedAt.toISOString(),
          org_name: org.name,
          accepted_by_email: acceptedByEmail,
          pan: org.pan,
          gstin: org.gstin,
        },
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[sign-service-agreement] insert failed", insertError);
      await admin.storage.from("compliance-docs").remove([filePath]);
      return NextResponse.json(
        { error: "Failed to record compliance document" },
        { status: 500 },
      );
    }

    notifyAgreementSigned(org.name, organizationId, acceptedByEmail);

    return NextResponse.json({ ok: true, docId: docRow.id, filePath });
  } catch (error) {
    console.error("[sign-service-agreement] Error:", error);
    return NextResponse.json(
      { error: "Failed to sign service agreement" },
      { status: 500 },
    );
  }
}
