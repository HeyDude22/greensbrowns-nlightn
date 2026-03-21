"use server";

import { verifyAdmin } from "@/lib/supabase/admin";

interface FarmerFormData {
  full_name: string;
  phone: string;
  farm_name?: string;
  farm_address?: string;
  farm_lat?: number;
  farm_lng?: number;
  land_area_acres?: number;
  capacity_kg_per_month?: number;
  compost_types?: string[];
  processor_type?: string;
  notes?: string;
}

export async function createFarmer(data: FarmerFormData) {
  const result = await verifyAdmin();
  if (result.error) return { error: result.error };
  const admin = result.admin!;

  // Generate a UUID for the farmer profile (no auth user needed)
  const userId = crypto.randomUUID();

  // Insert profile directly
  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    full_name: data.full_name,
    phone: data.phone,
    role: "farmer",
    kyc_status: "verified",
  });

  if (profileError) return { error: profileError.message };

  // Insert farmer_details
  const { error: detailsError } = await admin.from("farmer_details").insert({
    profile_id: userId,
    farm_name: data.farm_name || null,
    farm_address: data.farm_address || null,
    farm_lat: data.farm_lat || null,
    farm_lng: data.farm_lng || null,
    land_area_acres: data.land_area_acres || null,
    capacity_kg_per_month: data.capacity_kg_per_month || null,
    compost_types: data.compost_types || [],
    processor_type: data.processor_type || "farmer",
    notes: data.notes || null,
  });

  if (detailsError) return { error: detailsError.message };

  return { success: true, userId };
}

export async function updateFarmer(
  farmerId: string,
  data: FarmerFormData
) {
  const result = await verifyAdmin();
  if (result.error) return { error: result.error };
  const admin = result.admin!;

  // Update profile
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: data.full_name,
      phone: data.phone,
    })
    .eq("id", farmerId);

  if (profileError) return { error: profileError.message };

  // Upsert farmer_details
  const { error: detailsError } = await admin
    .from("farmer_details")
    .upsert(
      {
        profile_id: farmerId,
        farm_name: data.farm_name || null,
        farm_address: data.farm_address || null,
        farm_lat: data.farm_lat || null,
        farm_lng: data.farm_lng || null,
        land_area_acres: data.land_area_acres || null,
        capacity_kg_per_month: data.capacity_kg_per_month || null,
        compost_types: data.compost_types || [],
        processor_type: data.processor_type || "farmer",
        notes: data.notes || null,
      },
      { onConflict: "profile_id" }
    );

  if (detailsError) return { error: detailsError.message };

  return { success: true };
}
