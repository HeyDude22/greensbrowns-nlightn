import { jsPDF } from "jspdf";
import {
  buildFilledServiceAgreement,
  markdownToPlainTextForPdf,
  type ServiceAgreementOrgInput,
} from "@/lib/service-agreement-fill";

export function generateServiceAgreementPdf(
  org: ServiceAgreementOrgInput,
  acceptedByEmail: string,
  signedAt: Date = new Date(),
): Buffer {
  const markdown = buildFilledServiceAgreement(org, acceptedByEmail, signedAt);
  const plainText = markdownToPlainTextForPdf(markdown);

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const maxWidth = pageWidth - margin * 2;
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

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
