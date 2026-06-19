import type { PrepaidPackageStatus } from "@/types/enums";

export interface PrepaidCreditPackage {
  id: string;
  pickup_count: number;
  used_count: number;
  status: PrepaidPackageStatus;
  expires_at: string | null;
}

export type PrepaidPackageDisplayStatus =
  | "active"
  | "expired"
  | "exhausted"
  | "pending approval"
  | "rejected";

export function remainingCredits(pkg: PrepaidCreditPackage): number {
  return Math.max(0, pkg.pickup_count - pkg.used_count);
}

export function isPrepaidPackageExpired(pkg: PrepaidCreditPackage): boolean {
  return (
    pkg.status === "expired" ||
    (!!pkg.expires_at && new Date(pkg.expires_at) <= new Date())
  );
}

export function isPrepaidPackageExhausted(pkg: PrepaidCreditPackage): boolean {
  if (pkg.status === "exhausted") return true;
  if (pkg.status === "approved") return remainingCredits(pkg) === 0;
  return false;
}

/** Package has approved status, is not expired, and has credits left (FIFO-eligible). */
export function isUsablePrepaidPackage(pkg: PrepaidCreditPackage): boolean {
  return (
    pkg.status === "approved" &&
    !isPrepaidPackageExpired(pkg) &&
    remainingCredits(pkg) > 0
  );
}

export function sumAvailableCredits(packages: PrepaidCreditPackage[]): number {
  return packages
    .filter(isUsablePrepaidPackage)
    .reduce((sum, pkg) => sum + remainingCredits(pkg), 0);
}

/** FIFO: earliest-expiring package with remaining credits. */
export function selectFifoPrepaidPackage(
  packages: PrepaidCreditPackage[]
): PrepaidCreditPackage | null {
  const usable = packages.filter(isUsablePrepaidPackage);
  if (usable.length === 0) return null;

  return usable.sort((a, b) => {
    const aExpiry = a.expires_at ?? "";
    const bExpiry = b.expires_at ?? "";
    return aExpiry.localeCompare(bExpiry);
  })[0];
}

export function getPrepaidPackageDisplayStatus(
  pkg: PrepaidCreditPackage
): PrepaidPackageDisplayStatus {
  if (pkg.status === "pending") return "pending approval";
  if (pkg.status === "rejected") return "rejected";
  if (isPrepaidPackageExpired(pkg)) return "expired";
  if (pkg.status === "exhausted" || isPrepaidPackageExhausted(pkg)) {
    return "exhausted";
  }
  if (pkg.status === "approved") return "active";
  return "expired";
}

export const PREPAID_DISPLAY_STATUS_LABELS: Record<
  PrepaidPackageDisplayStatus,
  string
> = {
  active: "Active",
  expired: "Expired",
  exhausted: "Exhausted",
  "pending approval": "Pending approval",
  rejected: "Rejected",
};

export const PREPAID_DISPLAY_STATUS_COLORS: Record<
  PrepaidPackageDisplayStatus,
  string
> = {
  active: "bg-green-100 text-green-800",
  expired: "bg-gray-100 text-gray-600",
  exhausted: "bg-orange-100 text-orange-800",
  "pending approval": "bg-yellow-100 text-yellow-800",
  rejected: "bg-red-100 text-red-800",
};
