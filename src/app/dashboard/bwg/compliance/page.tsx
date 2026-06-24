"use client";

import { useEffect, useState } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDateDDMMYYYY } from "@/lib/utils";

const DOC_TYPE_LABELS: Record<string, string> = {
  manifest: "Manifest",
  receipt: "Receipt",
  certificate: "Certificate",
  report: "Report",
  agreement: "Service Agreement",
};

const DOC_TYPE_COLORS: Record<string, string> = {
  manifest: "bg-blue-100 text-blue-800",
  receipt: "bg-green-100 text-green-800",
  certificate: "bg-purple-100 text-purple-800",
  report: "bg-orange-100 text-orange-800",
  agreement: "bg-amber-100 text-amber-800",
};

interface ComplianceDoc {
  id: string;
  doc_type: string;
  file_url: string | null;
  generated_at: string;
  pickup_id: string | null;
  pickup: { pickup_number: string | null } | null;
}

export default function CompliancePage() {
  const { user, orgId, loading: orgLoading, supabase } = useOrganization();
  const [docs, setDocs] = useState<ComplianceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);

  async function fetchDocs() {
    if (!orgId) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("compliance_docs")
      .select("id, doc_type, file_url, generated_at, pickup_id, pickup:pickup_id(pickup_number)")
      .eq("organization_id", orgId)
      .order("generated_at", { ascending: false });

    if (data) setDocs(data as unknown as ComplianceDoc[]);
    setLoading(false);
  }

  useEffect(() => {
    if (orgLoading || !user) return;
    setLoading(true);
    fetchDocs();
  }, [user, orgId, orgLoading, supabase]);

  async function handleGenerateAgreement() {
    if (!orgId) return;
    setSigning(true);
    const res = await fetch("/api/bwg/sign-service-agreement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId }),
    });
    const json = await res.json().catch(() => ({}));
    setSigning(false);
    if (!res.ok) {
      toast.error(
        typeof json.error === "string"
          ? json.error
          : "Failed to generate service agreement",
      );
      return;
    }
    toast.success("Service agreement saved");
    setLoading(true);
    await fetchDocs();
  }

  const hasAgreement = docs.some((d) => d.doc_type === "agreement");

  if (orgLoading || loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance Documents"
        description="Manifests, receipts, and certificates for your pickups"
      />

      {orgId && !hasAgreement && docs.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>Service agreement PDF is not on file for your organization.</span>
          <Button size="sm" onClick={handleGenerateAgreement} disabled={signing}>
            {signing ? "Generating..." : "Generate service agreement"}
          </Button>
        </div>
      )}

      {docs.length === 0 ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Your signed service agreement should appear here after organization setup. If it is missing, generate it below (ensure legal details are filled on the Organization page)."
            />
            {orgId && !hasAgreement && (
              <div className="flex flex-wrap gap-2 justify-center">
                <Button
                  onClick={handleGenerateAgreement}
                  disabled={signing}
                >
                  {signing ? "Generating..." : "Generate service agreement"}
                </Button>
                <Button variant="outline" asChild>
                  <a href="/dashboard/bwg/organization">Update organization details</a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={DOC_TYPE_COLORS[doc.doc_type]}
                      >
                        {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {doc.pickup?.pickup_number || "—"}
                    </TableCell>
                    <TableCell>
                      {formatDateDDMMYYYY(doc.generated_at)}
                    </TableCell>
                    <TableCell>
                      {doc.file_url ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const { data, error } = await supabase.storage
                              .from("compliance-docs")
                              .createSignedUrl(doc.file_url!, 60);
                            if (error || !data?.signedUrl) {
                              toast.error("Failed to generate download link");
                              return;
                            }
                            window.open(data.signedUrl, "_blank");
                          }}
                        >
                          <Download className="mr-1 h-3 w-3" /> Download
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Pending
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
