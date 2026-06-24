"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import LocationPicker from "@/components/shared/location-picker-dynamic";
import { buildOsmEmbedUrl } from "@/lib/utils";
import { Building2, Pencil } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { buildServiceAgreementPreview } from "@/lib/service-agreement-fill";
import type { Organization, OrgType } from "@/types";

function SetupRequiredBanner() {
  const searchParams = useSearchParams();
  if (searchParams.get("setup") !== "required") return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      Set up your organization before you can access Pickups, Prepaid, or Compliance.
    </div>
  );
}

type OrgFormFields = {
  name: string;
  orgType: OrgType;
  address: string;
  pincode: string;
  lat: string;
  lng: string;
  registrationNumber: string;
  pan: string;
  gstin: string;
  signatoryName: string;
  signatoryDesignation: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
};

function orgToForm(org: Organization): OrgFormFields {
  return {
    name: org.name,
    orgType: org.org_type,
    address: org.address,
    pincode: org.pincode || "",
    lat: org.lat ? String(org.lat) : "",
    lng: org.lng ? String(org.lng) : "",
    registrationNumber: org.registration_number || "",
    pan: org.pan || "",
    gstin: org.gstin || "",
    signatoryName: org.signatory_name || "",
    signatoryDesignation: org.signatory_designation || "",
    contactName: org.contact_name || "",
    contactPhone: org.contact_phone || "",
    contactEmail: org.contact_email || "",
  };
}

function emptyForm(
  profile: { full_name: string | null; phone: string | null } | null,
  email: string | undefined,
): OrgFormFields {
  return {
    name: "",
    orgType: "apartment",
    address: "",
    pincode: "",
    lat: "",
    lng: "",
    registrationNumber: "",
    pan: "",
    gstin: "",
    signatoryName: profile?.full_name || "",
    signatoryDesignation: "",
    contactName: profile?.full_name || "",
    contactPhone: profile?.phone || "",
    contactEmail: email || "",
  };
}

export default function OrganizationPage() {
  const { user, profile, loading: userLoading } = useUser();
  const router = useRouter();
  const supabase = createClient();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [form, setForm] = useState<OrgFormFields>(() =>
    emptyForm(null, undefined),
  );

  function patchForm<K extends keyof OrgFormFields>(key: K, value: OrgFormFields[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (!user) return;
    async function fetchOrg() {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (membership) {
        const { data } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", membership.organization_id)
          .single();
        if (data) {
          const orgRow = data as Organization;
          setOrg(orgRow);
          setForm(orgToForm(orgRow));
        }
      } else if (profile) {
        setForm(emptyForm(profile, user!.email));
      }
      setLoading(false);
    }
    fetchOrg();
  }, [user, profile, supabase]);

  const agreementPreview = useMemo(() => {
    if (org) return null;
    return buildServiceAgreementPreview(
      {
        name: form.name || "—",
        org_type: form.orgType,
        address: form.address || "—",
        city: "Bengaluru",
        pincode: form.pincode || null,
        registration_number: form.registrationNumber || null,
        pan: form.pan || null,
        gstin: form.gstin || null,
        signatory_name: form.signatoryName || null,
        signatory_designation: form.signatoryDesignation || null,
        contact_name: form.contactName || null,
        contact_phone: form.contactPhone || null,
        contact_email: form.contactEmail || null,
      },
      form.contactEmail || user?.email || "—",
    );
  }, [org, form, user?.email]);

  if (userLoading || loading) return <DashboardSkeleton />;

  async function signServiceAgreement(organizationId: string) {
    const res = await fetch("/api/bwg/sign-service-agreement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 409) return true;
      toast.error(
        typeof json.error === "string"
          ? json.error
          : "Failed to save service agreement PDF",
      );
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const orgPayload = {
      name: form.name.trim(),
      org_type: form.orgType,
      address: form.address.trim(),
      pincode: form.pincode.trim() || null,
      lat: form.lat ? Number(form.lat) : null,
      lng: form.lng ? Number(form.lng) : null,
      registration_number: form.registrationNumber.trim(),
      pan: form.pan.trim().toUpperCase(),
      gstin: form.gstin.trim().toUpperCase(),
      signatory_name: form.signatoryName.trim(),
      signatory_designation: form.signatoryDesignation.trim(),
      contact_name: form.contactName.trim(),
      contact_phone: form.contactPhone.trim(),
      contact_email: form.contactEmail.trim(),
    };

    if (org) {
      const { error } = await supabase
        .from("organizations")
        .update(orgPayload)
        .eq("id", org.id);
      if (error) {
        toast.error("Failed to update organization");
      } else {
        setOrg({
          ...org,
          ...orgPayload,
          pincode: orgPayload.pincode || "",
        });
        setEditing(false);
        toast.success("Organization updated");
      }
    } else {
      const { data: newOrg, error: orgError } = await supabase
        .from("organizations")
        .insert(orgPayload)
        .select()
        .single();

      if (orgError || !newOrg) {
        toast.error(orgError?.message || "Failed to create organization");
        setSaving(false);
        return;
      }

      const { error: memberError } = await supabase
        .from("organization_members")
        .insert({
          organization_id: newOrg.id,
          user_id: user.id,
          role: "admin",
        });

      if (memberError) {
        toast.error("Organization created but failed to add membership");
        setSaving(false);
        return;
      }

      const agreementOk = await signServiceAgreement(newOrg.id);
      setOrg(newOrg as Organization);
      if (agreementOk) {
        toast.success("Organization created and service agreement saved");
      } else {
        toast.warning(
          "Organization created. Complete the service agreement from Compliance when ready.",
        );
      }
      router.refresh();
    }
    setSaving(false);
  }

  const orgTypeLabels: Record<OrgType, string> = {
    apartment: "Apartment Complex",
    rwa: "Resident Welfare Association",
    techpark: "Tech Park",
  };

  if (org && !editing) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Organization"
          description="Your organization details"
          action={
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
          }
        />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {org.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Type</p>
              <p className="font-medium">{orgTypeLabels[org.org_type]}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Address</p>
              <p className="font-medium">{org.address}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pincode</p>
              <p className="font-medium">{org.pincode || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Registration No.</p>
              <p className="font-medium">{org.registration_number || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">PAN</p>
              <p className="font-medium">{org.pan || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">GSTIN</p>
              <p className="font-medium">{org.gstin || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Signatory</p>
              <p className="font-medium">
                {org.signatory_name || "—"}
                {org.signatory_designation
                  ? ` · ${org.signatory_designation}`
                  : ""}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Coordinator</p>
              <p className="font-medium">
                {org.contact_name || "—"}
                {org.contact_phone ? ` · ${org.contact_phone}` : ""}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Contact email</p>
              <p className="font-medium">{org.contact_email || "—"}</p>
            </div>
            {org.lat && org.lng && (
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground mb-2">Location</p>
                <div className="rounded-md overflow-hidden border h-[200px]">
                  <iframe
                    title="Organization location"
                    width="100%"
                    height="200"
                    style={{ border: 0 }}
                    loading="lazy"
                    src={buildOsmEmbedUrl(Number(org.lat), Number(org.lng))}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const isCreate = !org;
  const legalComplete =
    form.registrationNumber.trim() &&
    form.pan.trim() &&
    form.gstin.trim() &&
    form.signatoryName.trim() &&
    form.signatoryDesignation.trim() &&
    form.contactName.trim() &&
    form.contactPhone.trim() &&
    form.contactEmail.trim();

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <SetupRequiredBanner />
      </Suspense>
      <PageHeader
        title={org ? "Edit Organization" : "Create Organization"}
        description={
          org
            ? "Update your organization details"
            : "Provide legal details for your service agreement and pickups"
        }
      />
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Site details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="name">Organization Name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => patchForm("name", e.target.value)}
                    placeholder="e.g. Prestige Lakeside Habitat"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgType">Organization Type</Label>
                  <Select
                    value={form.orgType}
                    onValueChange={(v) => patchForm("orgType", v as OrgType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apartment">Apartment Complex</SelectItem>
                      <SelectItem value="rwa">Resident Welfare Association</SelectItem>
                      <SelectItem value="techpark">Tech Park</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pincode">Pincode</Label>
                  <Input
                    id="pincode"
                    value={form.pincode}
                    onChange={(e) => patchForm("pincode", e.target.value)}
                    placeholder="560001"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="address">Registered Address</Label>
                  <Input
                    id="address"
                    value={form.address}
                    onChange={(e) => patchForm("address", e.target.value)}
                    placeholder="Full address as on registration documents"
                    required
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Map Location (pickup site)</Label>
                  <LocationPicker
                    lat={form.lat ? Number(form.lat) : null}
                    lng={form.lng ? Number(form.lng) : null}
                    onChange={(newLat, newLng) => {
                      patchForm("lat", String(newLat));
                      patchForm("lng", String(newLng));
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Legal &amp; billing (for agreement)</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="registrationNumber">Society / Company Registration No.</Label>
                  <Input
                    id="registrationNumber"
                    value={form.registrationNumber}
                    onChange={(e) => patchForm("registrationNumber", e.target.value)}
                    placeholder="As on registration certificate"
                    required={isCreate}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pan">Organization PAN</Label>
                  <Input
                    id="pan"
                    value={form.pan}
                    onChange={(e) => patchForm("pan", e.target.value.toUpperCase())}
                    placeholder="AAAAA0000A"
                    maxLength={10}
                    required={isCreate}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gstin">GSTIN</Label>
                  <Input
                    id="gstin"
                    value={form.gstin}
                    onChange={(e) => patchForm("gstin", e.target.value.toUpperCase())}
                    placeholder="29AAAAA0000A1Z5"
                    maxLength={15}
                    required={isCreate}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Authorized signatory</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="signatoryName">Signatory Name</Label>
                  <Input
                    id="signatoryName"
                    value={form.signatoryName}
                    onChange={(e) => patchForm("signatoryName", e.target.value)}
                    required={isCreate}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signatoryDesignation">Designation</Label>
                  <Input
                    id="signatoryDesignation"
                    value={form.signatoryDesignation}
                    onChange={(e) => patchForm("signatoryDesignation", e.target.value)}
                    placeholder="e.g. Secretary, Facility Manager"
                    required={isCreate}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Waste management coordinator</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contactName">Coordinator Name</Label>
                  <Input
                    id="contactName"
                    value={form.contactName}
                    onChange={(e) => patchForm("contactName", e.target.value)}
                    required={isCreate}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Coordinator Phone (WhatsApp)</Label>
                  <Input
                    id="contactPhone"
                    type="tel"
                    value={form.contactPhone}
                    onChange={(e) => patchForm("contactPhone", e.target.value)}
                    placeholder="+919731296263"
                    required={isCreate}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="contactEmail">Organization Contact Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => patchForm("contactEmail", e.target.value)}
                    required={isCreate}
                  />
                </div>
              </div>
            </div>

            {isCreate && (
              <Card>
                <CardHeader>
                  <CardTitle>Service Agreement Preview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    The agreement below is filled from the details you enter. Scroll to review before accepting.
                  </p>
                  <div className="max-h-96 overflow-y-auto rounded-md border p-4">
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{agreementPreview || ""}</ReactMarkdown>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="agreement"
                      checked={agreementAccepted}
                      onCheckedChange={(checked) =>
                        setAgreementAccepted(checked === true)
                      }
                    />
                    <Label htmlFor="agreement" className="text-sm font-normal cursor-pointer">
                      I have read and agree to the GreensBrowns Service Agreement
                    </Label>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={
                  saving ||
                  (isCreate && (!agreementAccepted || !legalComplete))
                }
              >
                {saving ? "Saving..." : org ? "Update" : "Create Organization"}
              </Button>
              {org && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setForm(orgToForm(org));
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
