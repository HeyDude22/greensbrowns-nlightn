/** GreensBrowns (service provider) details embedded in BWG service agreements. */
export function getGreensBrownsLegal() {
  return {
    legalEntityName:
      process.env.GB_LEGAL_ENTITY_NAME?.trim() || "NLightN Technologies Pvt Ltd",
    registeredAddress:
      process.env.GB_REGISTERED_ADDRESS?.trim() ||
      "Bengaluru, Karnataka, India",
    pan: process.env.GB_PAN?.trim() || "",
    gstin: process.env.GB_GSTIN?.trim() || "",
    email: process.env.GB_CONTACT_EMAIL?.trim() || "ops@greensbrowns.in",
    phone: process.env.GB_CONTACT_PHONE?.trim() || "",
    platformUrl:
      process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://greensbrowns.in",
  };
}
