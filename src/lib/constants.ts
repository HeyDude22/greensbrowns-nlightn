import {
  Home,
  Truck,
  Building2,
  FileText,
  Users,
  BarChart3,
  Sprout,
  Wrench,
  ShieldCheck,
  CreditCard,
  PackagePlus,
  IndianRupee,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import type { UserRole, KycStatus, PickupStatus, PrepaidPackageStatus, VehicleType, VehicleDocType, TripStatus, JobStatus, ProcessorType } from "@/types/enums";

export const APP_NAME = "GreensBrowns";
export const APP_DESCRIPTION =
  "Digital circular marketplace for leafy & horticulture waste";

export const ROLES: Record<UserRole, { label: string; description: string }> = {
  bwg: {
    label: "Bulk Waste Generator",
    description: "Apartments, RWAs, Tech Parks",
  },
  collector: {
    label: "Collector",
    description: "Licensed waste collectors",
  },
  farmer: {
    label: "Processor",
    description: "Compost & organic farming",
  },
  admin: {
    label: "Admin",
    description: "Platform administration",
  },
};

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const NAV_ITEMS: Record<"bwg", NavItem[]> = {
  bwg: [
    { title: "Dashboard", href: "/dashboard/bwg", icon: Home },
    { title: "Pickups", href: "/dashboard/bwg/pickups", icon: Truck },
    { title: "Organization", href: "/dashboard/bwg/organization", icon: Building2 },
    { title: "Compliance", href: "/dashboard/bwg/compliance", icon: FileText },
    { title: "Prepaid", href: "/dashboard/bwg/prepaid", icon: CreditCard },
  ],
};

export const COMPOST_TYPE_OPTIONS = [
  { value: "vermicompost", label: "Vermicompost" },
  { value: "aerobic_compost", label: "Aerobic Compost" },
  { value: "biochar", label: "Biochar" },
  { value: "mulch", label: "Mulch" },
  { value: "leaf_mold", label: "Leaf Mold" },
] as const;

export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    group: "Operations",
    items: [
      { title: "Dashboard", href: "/dashboard/admin", icon: Home },
      { title: "Users", href: "/dashboard/admin/users", icon: Users },
      { title: "Pickups", href: "/dashboard/admin/pickups", icon: Truck },
      { title: "Jobs", href: "/dashboard/admin/jobs", icon: ClipboardList },
      { title: "Organizations", href: "/dashboard/admin/organizations", icon: Building2 },
      { title: "Processors", href: "/dashboard/admin/farmers", icon: Sprout },
      { title: "Reports", href: "/dashboard/admin/reports", icon: BarChart3 },
    ],
  },
  {
    group: "Setup",
    items: [
      { title: "Prepaid Packages", href: "/dashboard/admin/setup/prepaid-packages", icon: PackagePlus },
      { title: "Pickup Pricing", href: "/dashboard/admin/setup/pricing", icon: IndianRupee },
      { title: "Collector Vehicles", href: "/dashboard/admin/setup/collector-vehicles", icon: Truck },
    ],
  },
];

export const KYC_STATUS_COLORS: Record<KycStatus, string> = {
  pending: "bg-gray-100 text-gray-800",
  submitted: "bg-blue-100 text-blue-800",
  verified: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export const PICKUP_STATUS_LABELS: Record<PickupStatus, string> = {
  requested: "Requested",
  verified: "Verified",
  assigned: "Assigned",
  driver_accepted: "Driver Accepted",
  driver_not_accepted: "Driver Not Accepted",
  enroute: "Enroute",
  arrived_bwg: "Arrived at BWG",
  full_pickup: "Full Pickup",
  partial_pickup: "Partial Pickup",
  in_transit: "In Transit",
  arrived_processor: "Arrived at Processor",
  accepted: "Accepted",
  rejected: "Rejected",
  processed: "Processed",
  cancelled: "Cancelled",
};

export const PICKUP_STATUS_COLORS: Record<PickupStatus, string> = {
  requested: "bg-blue-100 text-blue-800",
  verified: "bg-teal-100 text-teal-800",
  assigned: "bg-yellow-100 text-yellow-800",
  driver_accepted: "bg-amber-100 text-amber-800",
  driver_not_accepted: "bg-red-100 text-red-800",
  enroute: "bg-orange-100 text-orange-800",
  arrived_bwg: "bg-orange-200 text-orange-900",
  full_pickup: "bg-lime-100 text-lime-900",
  partial_pickup: "bg-lime-200 text-lime-900",
  in_transit: "bg-purple-100 text-purple-800",
  arrived_processor: "bg-green-100 text-green-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  processed: "bg-emerald-200 text-emerald-900",
  cancelled: "bg-red-100 text-red-800",
};

export const PREPAID_STATUS_LABELS: Record<PrepaidPackageStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  exhausted: "Exhausted",
};

export const PREPAID_STATUS_COLORS: Record<PrepaidPackageStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-gray-100 text-gray-800",
  exhausted: "bg-orange-100 text-orange-800",
};

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  trolley: "Trolley / Handcart",
  auto: "Auto (3-Wheeler)",
  mini_truck: "Mini Truck",
  pickup: "Pickup",
  tempo: "Tempo / LCV",
  tipper: "Tipper",
  light_truck: "Light Truck",
  medium_truck: "Medium Truck",
  truck: "Heavy Truck",
};

export const VEHICLE_TYPE_DETAILS: Record<VehicleType, { examples: string; capacity: number; volume_m3: number }> = {
  trolley: { examples: "BBMP handcart, fabricated steel push trolley", capacity: 300, volume_m3: 1.2 },
  auto: { examples: "Piaggio Ape, Mahindra Treo Zor", capacity: 400, volume_m3: 2.5 },
  mini_truck: { examples: "Tata Ace Gold, Mahindra Supro, Ashok Leyland Dost", capacity: 1000, volume_m3: 6 },
  pickup: { examples: "Mahindra Bolero Pikup, Tata Yodha", capacity: 1500, volume_m3: 4.5 },
  tempo: { examples: "Force Traveller, Tata Intra", capacity: 1500, volume_m3: 7 },
  tipper: { examples: "Tata Ace Tipper, Mahindra Supro Tipper, Tata 407 Tipper", capacity: 2000, volume_m3: 4 },
  light_truck: { examples: "Tata 407, Eicher Pro 2049", capacity: 3000, volume_m3: 15 },
  medium_truck: { examples: "Tata 709, Ashok Leyland Ecomet", capacity: 6000, volume_m3: 22 },
  truck: { examples: "Tata 1109, Ashok Leyland 1618", capacity: 10000, volume_m3: 35 },
};

export const GREEN_WASTE_DENSITY_KG_PER_M3 = 150;

export const VEHICLE_DOC_LABELS: Record<VehicleDocType, string> = {
  rc: "Registration Certificate",
  insurance: "Insurance",
  tax_receipt: "Tax Paid Receipt",
  emission_cert: "Emission Certificate",
  fitness_cert: "Fitness Certificate",
};

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  in_transit: "In Transit",
  delivered: "Delivered",
};

export const TRIP_STATUS_COLORS: Record<TripStatus, string> = {
  in_transit: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  dispatched: "Dispatched",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  draft: "bg-gray-100 text-gray-800",
  pending: "bg-blue-100 text-blue-800",
  dispatched: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

export const PROCESSOR_TYPE_LABELS: Record<ProcessorType, string> = {
  farmer: "Farmer",
  biochar: "Biochar Producer",
  compost_manufacturer: "Compost Manufacturer",
  mulch_producer: "Mulch Producer",
  other: "Other",
};

export const CLUSTER_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];
