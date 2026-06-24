import { SERVICE_AGREEMENT_MD } from "@/lib/service-agreement";
import { getGreensBrownsLegal } from "@/lib/greensbrowns-legal";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "@/lib/utils";
import type { OrgType } from "@/types/enums";

export interface ServiceAgreementOrgInput {
  id: string;
  name: string;
  org_type: OrgType;
  address: string;
  city: string;
  pincode: string | null;
  registration_number: string | null;
  pan: string | null;
  gstin: string | null;
  signatory_name: string | null;
  signatory_designation: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
}

const ORG_TYPE_CLAUSE: Record<OrgType, string> = {
  apartment: "an apartment complex",
  rwa: "a residential welfare association",
  techpark: "a tech park / institutional campus",
};

function clientAddressLine(org: ServiceAgreementOrgInput): string {
  const pin = org.pincode?.trim();
  const parts = [org.address.trim(), org.city.trim()];
  if (pin) parts.push(pin);
  parts.push("Bengaluru, Karnataka, India");
  return parts.filter(Boolean).join(", ");
}

function agreementNumber(orgId: string): string {
  return `GB/BWG/${orgId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function fillTableSection(
  section: string,
  replacements: Record<string, string>,
): string {
  let out = section;
  for (const [placeholder, value] of Object.entries(replacements)) {
    out = out.replace(placeholder, value);
  }
  return out;
}

/** Build service agreement markdown with org and signer details filled in. */
export function buildFilledServiceAgreement(
  org: ServiceAgreementOrgInput,
  acceptedByEmail: string,
  signedAt: Date = new Date(),
): string {
  const gb = getGreensBrownsLegal();
  const agreementDate = formatDateDDMMYYYY(signedAt.toISOString().split("T")[0]);
  const acceptedAt = formatDateTimeDDMMYYYY(signedAt);
  const orgClause = ORG_TYPE_CLAUSE[org.org_type];
  const addressLine = clientAddressLine(org);

  let md = SERVICE_AGREEMENT_MD;

  md = md.replace("**Agreement No.:** GB/BWG/________", `**Agreement No.:** ${agreementNumber(org.id)}`);
  md = md.replace("**Date:** ____________________", `**Date:** ${agreementDate}`);

  md = md.replace(
    '**GreensBrowns** (hereinafter referred to as the **"Service Provider"** or **"GreensBrowns"**), a platform operated by ________________________, having its registered office at ________________________, Bengaluru, Karnataka, India, PAN: ______________, GSTIN: __________________;',
    `**GreensBrowns** (hereinafter referred to as the **"Service Provider"** or **"GreensBrowns"**), a platform operated by **${gb.legalEntityName}**, having its registered office at **${gb.registeredAddress}**, Bengaluru, Karnataka, India, PAN: **${gb.pan || "—"}**, GSTIN: **${gb.gstin || "—"}**;`,
  );

  md = md.replace(
    "**________________________** (hereinafter referred to as the **\"BWG\"** or **\"Client\"**), a Bulk Waste Generator being an apartment complex / residential welfare association / tech park / institutional campus *(strike out whichever is not applicable)*, having its registered address at ________________________, Bengaluru, Karnataka, India, Registration No.: ________________, represented by its authorized signatory Shri/Smt. ________________________, designated as ________________________;",
    `**${org.name}** (hereinafter referred to as the **"BWG"** or **"Client"**), a Bulk Waste Generator being ${orgClause}, having its registered address at **${addressLine}**, Registration No.: **${org.registration_number?.trim() || "—"}**, represented by its authorized signatory Shri/Smt. **${org.signatory_name?.trim() || "—"}**, designated as **${org.signatory_designation?.trim() || "—"}**;`,
  );

  const bwgSignatureMarker = "### For and on behalf of the BWG (Client)";
  const bwgSigIndex = md.indexOf(bwgSignatureMarker);
  if (bwgSigIndex !== -1) {
    const before = md.slice(0, bwgSigIndex);
    const bwgSig = fillTableSection(md.slice(bwgSigIndex), {
      "| **Organization Name:** | ________________________________ |": `| **Organization Name:** | ${org.name} |`,
      "| **Name of Authorized Signatory:** | ________________________________ |": `| **Name of Authorized Signatory:** | ${org.signatory_name?.trim() || "—"} |`,
      "| **Designation:** | ________________________________ |": `| **Designation:** | ${org.signatory_designation?.trim() || "—"} |`,
      "| **Date:** | ________________________________ |": `| **Date:** | ${agreementDate} |`,
    });
    md = before + bwgSig;
  }

  const annexureMarker = "## ANNEXURE C --- CONTACT INFORMATION";
  const annexureIndex = md.indexOf(annexureMarker);
  if (annexureIndex !== -1) {
    const beforeAnnexure = md.slice(0, annexureIndex);
    const annexure = md.slice(annexureIndex);
    const clientMarker = "### Client (BWG)";
    const clientIndex = annexure.indexOf(clientMarker);

    const gbAnnexure =
      clientIndex === -1
        ? annexure
        : annexure.slice(0, clientIndex);
    const clientAnnexure =
      clientIndex === -1 ? "" : annexure.slice(clientIndex);

    const filledGb = fillTableSection(gbAnnexure, {
      "| **Registered Address:** | ________________________________, Bengaluru, Karnataka, India |": `| **Registered Address:** | ${gb.registeredAddress}, Bengaluru, Karnataka, India |`,
      "| **Email:** | ________________________________ |": `| **Email:** | ${gb.email} |`,
      "| **Phone:** | ________________________________ |": `| **Phone:** | ${gb.phone || "—"} |`,
      "| **Platform URL:** | ________________________________ |": `| **Platform URL:** | ${gb.platformUrl} |`,
      "| **GSTIN:** | ________________________________ |": `| **GSTIN:** | ${gb.gstin || "—"} |`,
    });

    const filledClient = fillTableSection(clientAnnexure, {
      "| **Registered Address:** | ________________________________, Bengaluru, Karnataka, India |": `| **Registered Address:** | ${addressLine} |`,
      "| **Email:** | ________________________________ |": `| **Email:** | ${org.contact_email?.trim() || acceptedByEmail} |`,
      "| **Phone:** | ________________________________ |": `| **Phone:** | ${org.contact_phone?.trim() || "—"} |`,
      "| **Waste Management Coordinator Name:** | ________________________________ |": `| **Waste Management Coordinator Name:** | ${org.contact_name?.trim() || "—"} |`,
      "| **Waste Management Coordinator Phone:** | ________________________________ |": `| **Waste Management Coordinator Phone:** | ${org.contact_phone?.trim() || "—"} |`,
      "| **Waste Management Coordinator Email:** | ________________________________ |": `| **Waste Management Coordinator Email:** | ${org.contact_email?.trim() || acceptedByEmail} |`,
    });

    md = beforeAnnexure + filledGb + filledClient;
  }

  md += `\n\n---\n\n**DIGITAL ACCEPTANCE**\n\nDigitally accepted by: ${acceptedByEmail}\nOrganization: ${org.name}\nClient PAN: ${org.pan?.trim() || "—"}\nClient GSTIN: ${org.gstin?.trim() || "—"}\nDate: ${acceptedAt}\n`;

  return md;
}

export function markdownToPlainTextForPdf(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\|.*$/gm, "")
    .replace(/^---+$/gm, "")
    .replace(/&nbsp;/g, " ")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\n{3,}/g, "\n\n");
}

/** Partial org input for live preview before the org row exists. */
export function buildServiceAgreementPreview(
  org: Omit<ServiceAgreementOrgInput, "id"> & { id?: string },
  acceptedByEmail: string,
): string {
  return buildFilledServiceAgreement(
    {
      ...org,
      id: org.id ?? "00000000-0000-0000-0000-000000000000",
    },
    acceptedByEmail,
  );
}
