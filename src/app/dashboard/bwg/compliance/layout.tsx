import { requireBwgOrganization } from "@/lib/bwg-org-guard";

export default async function BwgComplianceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireBwgOrganization();
  return children;
}
