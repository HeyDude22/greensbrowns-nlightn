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

/** Internal auth email for processors created without a login email in the form. */
function processorAuthEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "") || "unknown";
  return `processor.${digits}.${crypto.randomUUID().slice(0, 8)}@greensbrowns.local`;
}

export async function createFarmer(data: FarmerFormData) {
  const result = await verifyAdmin();
  if (result.error) return { error: result.error };
  const admin = result.admin!;

  const email = processorAuthEmail(data.phone);
  const password = crypto.randomUUID() + crypto.randomUUID();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: data.full_name, phone: data.phone },
  });

  if (authError) return { error: authError.message };

  const userId = authData.user.id;

  // Signup trigger creates a bwg profile; upsert to farmer with admin fields.
  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    email,
    full_name: data.full_name,
    phone: data.phone,
    role: "farmer",
    kyc_status: "verified",
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return { error: profileError.message };
  }

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

  if (detailsError) {
    await admin.auth.admin.deleteUser(userId);
    return { error: detailsError.message };
  }

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
