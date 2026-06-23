import type { PickupStatus } from "@/types/enums";
import {
  PICKUP_STATUS_LABELS,
  PICKUP_STATUS_COLORS,
} from "@/lib/constants";

/** Canonical pipeline order for dashboards, filters, and timeline sorting. */
export const PICKUP_PIPELINE_ORDER: PickupStatus[] = [
  "requested",
  "verified",
  "assigned",
  "driver_accepted",
  "driver_not_accepted",
  "enroute",
  "arrived_bwg",
  "full_pickup",
  "partial_pickup",
  "in_transit",
  "arrived_processor",
  "accepted",
  "processed",
  "rejected",
  "cancelled",
];

/** Statuses where a collector/driver is actively working a pickup. */
export const COLLECTOR_ACTIVE_STATUSES: PickupStatus[] = [
  "assigned",
  "driver_accepted",
  "enroute",
  "arrived_bwg",
  "full_pickup",
  "partial_pickup",
  "in_transit",
];

/** Terminal / closed statuses (not active pipeline). */
export const PICKUP_TERMINAL_STATUSES: PickupStatus[] = [
  "processed",
  "cancelled",
  "rejected",
  "driver_not_accepted",
];

/** Legacy DB values migrated in 00042 — kept for defensive display only. */
export const LEGACY_PICKUP_STATUS_MAP: Partial<Record<string, PickupStatus>> = {
  scheduled: "requested",
  picked_up: "full_pickup",
  delivered: "arrived_processor",
  received: "accepted",
};

export function normalizePickupStatus(status: string): PickupStatus {
  return (LEGACY_PICKUP_STATUS_MAP[status] ?? status) as PickupStatus;
}

export function pickupStatusSortIndex(status: PickupStatus): number {
  const normalized = normalizePickupStatus(status);
  const idx = PICKUP_PIPELINE_ORDER.indexOf(normalized);
  return idx === -1 ? PICKUP_PIPELINE_ORDER.length : idx;
}

export function sortPickupEventsByStatus<T extends { status: PickupStatus; created_at: string }>(
  events: T[],
): T[] {
  return [...events].sort((a, b) => {
    const orderDiff =
      pickupStatusSortIndex(a.status) - pickupStatusSortIndex(b.status);
    if (orderDiff !== 0) return orderDiff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

export function pickupStatusLabel(status: string): string {
  const key = normalizePickupStatus(status);
  return PICKUP_STATUS_LABELS[key] ?? status.replace(/_/g, " ");
}

export function pickupStatusColor(status: string): string {
  const key = normalizePickupStatus(status);
  return PICKUP_STATUS_COLORS[key] ?? "bg-gray-100 text-gray-800";
}
