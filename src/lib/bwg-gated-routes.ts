/** BWG routes that require organization membership before access. */
export const BWG_ORG_REQUIRED_PREFIXES = [
  "/dashboard/bwg/pickups",
  "/dashboard/bwg/prepaid",
  "/dashboard/bwg/compliance",
] as const;

export function isBwgOrgRequiredPath(pathname: string): boolean {
  return BWG_ORG_REQUIRED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
}
