export type { UserRole, KycStatus, OrgType, PickupStatus, RecurrenceType, PaymentStatus, ComplianceDocType, TicketStatus, VehicleType, PrepaidPackageStatus, VehicleDocType, TripStatus, JobStatus } from "./enums";

export interface Profile {
  id: string;
  role: import("./enums").UserRole;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  kyc_status: import("./enums").KycStatus;
  kyc_notes: string | null;
  city: string;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  org_type: import("./enums").OrgType;
  address: string;
  ward: string | null;
  city: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  registration_number: string | null;
  pan: string | null;
  gstin: string | null;
  signatory_name: string | null;
  signatory_designation: string | null;
  no_show_count: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Pickup {
  id: string;
  pickup_number: string;
  organization_id: string;
  requested_by: string;
  farmer_id: string | null;
  vehicle_id: string | null;
  prepaid_package_id: string | null;
  status: import("./enums").PickupStatus;
  scheduled_date: string;
  scheduled_slot: string | null;
  recurrence: import("./enums").RecurrenceType;
  estimated_weight_kg: number | null;
  estimated_volume_m3: number | null;
  actual_weight_kg: number | null;
  loading_helper_required: boolean;
  waste_photo_urls: string[];
  photo_before_url: string | null;
  photo_after_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrepaidPackagePlan {
  id: string;
  name: string;
  pickup_count: number;
  validity_days: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrepaidPackage {
  id: string;
  organization_id: string;
  plan_id: string | null;
  pickup_count: number;
  used_count: number;
  status: import("./enums").PrepaidPackageStatus;
  requested_by: string;
  approved_by: string | null;
  approved_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PickupEvent {
  id: string;
  pickup_id: string;
  status: import("./enums").PickupStatus;
  changed_by: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  created_at: string;
}

export interface Vehicle {
  id: string;
  created_by: string | null;
  registration_number: string;
  vehicle_type: import("./enums").VehicleType;
  capacity_kg: number;
  volume_capacity_m3: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  name: string;
  license_number: string;
  phone: string;
  license_photo_path: string | null;
  license_valid_till: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VehicleDriver {
  id: string;
  vehicle_id: string;
  driver_id: string;
  assigned_at: string;
  assigned_by: string | null;
}

export interface VehicleDocument {
  id: string;
  vehicle_id: string;
  doc_type: import("./enums").VehicleDocType;
  file_path: string;
  uploaded_by: string;
  uploaded_at: string;
  expires_at: string | null;
}

export interface AssignedPackage {
  id: string;
  organization_id: string;
  plan_id: string;
  price_paise: number;
  assigned_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FarmerDetails {
  id: string;
  profile_id: string;
  farm_name: string | null;
  farm_address: string | null;
  farm_lat: number | null;
  farm_lng: number | null;
  land_area_acres: number | null;
  capacity_kg_per_month: number | null;
  compost_types: string[];
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PickupTrip {
  id: string;
  pickup_id: string;
  trip_number: number;
  status: import("./enums").TripStatus;
  photo_urls: string[];
  photo_metadata: Array<{
    url: string;
    lat: number | null;
    lng: number | null;
    timestamp: string;
  }>;
  started_at: string;
  delivered_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Job {
  id: string;
  job_number: string;
  vehicle_id: string;
  farmer_id: string;
  driver_id: string | null;
  scheduled_date: string;
  status: import("./enums").JobStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface JobPickup {
  id: string;
  job_id: string;
  pickup_id: string;
  created_at: string;
}

export interface VehicleTypeRate {
  id: string;
  vehicle_type: import("./enums").VehicleType;
  base_fare_rs: number;
  per_km_rs: number;
  updated_at: string;
  updated_by: string | null;
}
