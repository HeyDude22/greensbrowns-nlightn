"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { buildOsmEmbedUrl, formatDateTimeDDMMYYYY } from "@/lib/utils";
import { Building2, Pencil } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { jsPDF } from "jspdf";
import { SERVICE_AGREEMENT_MD } from "@/lib/service-agreement";
import { notifyAgreementSigned } from "@/lib/notifications";
import type { Organization, OrgType } from "@/types";

export default function OrganizationPage() {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const supabase = createClient();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("apartment");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [agreementAccepted, setAgreementAccepted] = useState(false);

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
          setOrg(data as Organization);
          setName(data.name);
          setOrgType(data.org_type as OrgType);
          setAddress(data.address);
          setPincode(data.pincode || "");
          setLat(data.lat ? String(data.lat) : "");
          setLng(data.lng ? String(data.lng) : "");
        }
      }
      setLoading(false);
    }
    fetchOrg();
  }, [user, supabase]);

  if (userLoading || loading) return <DashboardSkeleton />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    if (org) {
      // Update existing org
      const { error } = await supabase
        .from("organizations")
        .update({ name, org_type: orgType, address, pincode, lat: lat ? Number(lat) : null, lng: lng ? Number(lng) : null })
        .eq("id", org.id);
      if (error) {
        toast.error("Failed to update organization");
      } else {
        setOrg({ ...org, name, org_type: orgType, address, pincode, lat: lat ? Number(lat) : null, lng: lng ? Number(lng) : null });
        setEditing(false);
        toast.success("Organization updated");
      }
    } else {
      // Create new org + membership
      const { data: newOrg, error: orgError } = await supabase
        .from("organizations")
        .insert({ name, org_type: orgType, address, pincode, lat: lat ? Number(lat) : null, lng: lng ? Number(lng) : null })
        .select()
        .single();

      if (orgError || !newOrg) {
        toast.error("Failed to create organization");
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
      } else {
        setOrg(newOrg as Organization);
        toast.success("Organization created!");

        // Fire-and-forget: store signed agreement as PDF + notify
        (async () => {
          try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filePath = `${newOrg.id}/service-agreement-${timestamp}.pdf`;

            // Generate PDF from agreement text
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 15;
            const maxWidth = pageWidth - margin * 2;
            // Strip markdown syntax for plain-text PDF
            const plainText = SERVICE_AGREEMENT_MD
              .replace(/^#{1,6}\s+/gm, "")
              .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
              .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
              .replace(/^\|.*$/gm, "")
              .replace(/^---+$/gm, "")
              .replace(/&nbsp;/g, " ")
              .replace(/\n{3,}/g, "\n\n");
            const lines = doc.splitTextToSize(plainText, maxWidth);
            let y = 20;
            const lineHeight = 5;
            doc.setFontSize(9);
            for (const line of lines) {
              if (y > doc.internal.pageSize.getHeight() - 15) {
                doc.addPage();
                y = 15;
              }
              doc.text(line, margin, y);
              y += lineHeight;
            }
            // Add signing metadata on last page
            y += 10;
            if (y > doc.internal.pageSize.getHeight() - 30) {
              doc.addPage();
              y = 15;
            }
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(`Digitally accepted by: ${user.email}`, margin, y);
            doc.text(`Organization: ${name}`, margin, y + 5);
            doc.text(`Date: ${formatDateTimeDDMMYYYY(new Date())}`, margin, y + 10);

            const pdfBlob = doc.output("blob");

            const { error: uploadError } = await supabase.storage
              .from("compliance-docs")
              .upload(filePath, pdfBlob, {
                contentType: "application/pdf",
              });

            if (uploadError) {
              console.error("Failed to upload agreement:", uploadError);
              return;
            }

            const { error: docError } = await supabase
              .from("compliance_docs")
              .insert({
                organization_id: newOrg.id,
                doc_type: "agreement",
                file_url: filePath,
                metadata: {
                  signed_by: user.id,
                  signed_at: new Date().toISOString(),
                  org_name: name,
                },
              });

            if (docError) {
              console.error("Failed to insert compliance doc:", docError);
            }

            notifyAgreementSigned(name, newOrg.id, user.email);
          } catch (err) {
            console.error("Agreement storage/notification error:", err);
          }
        })();

        // Refresh server layout so sidebar detects the new org membership
        router.refresh();
      }
    }
    setSaving(false);
  }

  const orgTypeLabels: Record<OrgType, string> = {
    apartment: "Apartment Complex",
    rwa: "Resident Welfare Association",
    techpark: "Tech Park",
  };

  // Show org details (read-only)
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
              <p className="text-sm text-muted-foreground">City</p>
              <p className="font-medium">{org.city}</p>
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

  // Create / Edit form
  return (
    <div className="space-y-6">
      <PageHeader
        title={org ? "Edit Organization" : "Create Organization"}
        description={
          org
            ? "Update your organization details"
            : "Set up your organization to start scheduling pickups"
        }
      />
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Prestige Lakeside Habitat"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgType">Organization Type</Label>
              <Select
                value={orgType}
                onValueChange={(v) => setOrgType(v as OrgType)}
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
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Full address"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pincode">Pincode</Label>
              <Input
                id="pincode"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                placeholder="560001"
              />
            </div>
            <div className="space-y-2">
              <Label>Map Location</Label>
              <LocationPicker
                lat={lat ? Number(lat) : null}
                lng={lng ? Number(lng) : null}
                onChange={(newLat, newLng) => {
                  setLat(String(newLat));
                  setLng(String(newLng));
                }}
              />
            </div>
            {!org && (
              <Card>
                <CardHeader>
                  <CardTitle>Service Agreement</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="max-h-96 overflow-y-auto rounded-md border p-4">
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{SERVICE_AGREEMENT_MD}</ReactMarkdown>
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
              <Button type="submit" disabled={saving || (!org && !agreementAccepted)}>
                {saving ? "Saving..." : org ? "Update" : "Create Organization"}
              </Button>
              {org && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(false)}
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
