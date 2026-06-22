export type UserRole = "bwg" | "collector" | "farmer" | "admin";

export type KycStatus = "pending" | "submitted" | "verified" | "rejected";

export type OrgType = "apartment" | "rwa" | "techpark";

export type PickupStatus =
  | "requested"
  | "verified"
  | "assigned"
  | "driver_accepted"
  | "enroute"
  | "arrived_bwg"
  | "full_pickup"
  | "partial_pickup"
  | "in_transit"
  | "arrived_processor"
  | "accepted"
  | "rejected"
  | "processed"
  | "cancelled";

export type RejectionReason = "mixed_waste" | "capacity_full" | "other";

export type RecurrenceType = "one_time" | "weekly" | "biweekly" | "monthly";

export type PaymentStatus = "pending" | "paid" | "overdue" | "cancelled";

export type ComplianceDocType =
  | "manifest"
  | "receipt"
  | "certificate"
  | "report"
  | "agreement";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type VehicleType = "auto" | "mini_truck" | "pickup" | "light_truck" | "medium_truck" | "truck" | "tempo" | "tipper" | "trolley";

export type PrepaidPackageStatus = "pending" | "approved" | "rejected" | "expired" | "exhausted";

export type VehicleDocType = "rc" | "insurance" | "tax_receipt" | "emission_cert" | "fitness_cert";

export type TripStatus = "in_transit" | "delivered";

export type JobStatus = "draft" | "pending" | "dispatched" | "in_progress" | "completed" | "cancelled";

export type ProcessorType = 'farmer' | 'biochar' | 'compost_manufacturer' | 'mulch_producer' | 'other';
