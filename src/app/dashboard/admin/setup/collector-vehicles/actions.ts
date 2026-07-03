"use server";

import { verifyAdmin } from "@/lib/supabase/admin";

export interface DriverFormData {
  name: string;
  license_number: string;
  phone: string;
  license_photo_path: string | null;
  license_valid_till: string | null;
}

function collectorAuthEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "") || "unknown";
  return `collector.${digits}.${crypto.randomUUID().slice(0, 8)}@greensbrowns.local`;
}

function phoneVariants(phone: string): string[] {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  const variants = [trimmed, digits, `+${digits}`];
  if (digits.startsWith("91") && digits.length > 10) {
    variants.push(digits.slice(2), `+${digits.slice(2)}`);
  }
  return [...new Set(variants.filter(Boolean))];
}

async function assertPhoneAvailable(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  phone: string,
  excludeProfileId?: string
): Promise<string | null> {
  const variants = phoneVariants(phone);

  let profileQuery = admin.from("profiles").select("id").in("phone", variants);
  if (excludeProfileId) {
    profileQuery = profileQuery.neq("id", excludeProfileId);
  }
  const { data: profileMatch } = await profileQuery.limit(1).maybeSingle();
  if (profileMatch) {
    return "This phone number is already registered to another user";
  }

  let driverQuery = admin.from("drivers").select("id").in("phone", variants);
  if (excludeProfileId) {
    driverQuery = driverQuery.neq("id", excludeProfileId);
  }
  const { data: driverMatch } = await driverQuery.limit(1).maybeSingle();
  if (driverMatch) {
    return "This phone number is already used by another driver";
  }

  return null;
}

async function upsertCollectorProfile(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  userId: string,
  email: string,
  data: Pick<DriverFormData, "name" | "phone">
) {
  const { error } = await admin.from("profiles").upsert({
    id: userId,
    email,
    full_name: data.name.trim(),
    phone: data.phone.trim(),
    role: "collector",
    kyc_status: "verified",
  });
  if (error) throw new Error(error.message);
}

async function syncAuthUser(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  userId: string,
  data: Pick<DriverFormData, "name" | "phone">
) {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    phone: data.phone.trim(),
    user_metadata: {
      full_name: data.name.trim(),
      phone: data.phone.trim(),
      role: "collector",
    },
  });
  if (error) throw new Error(error.message);
}

async function isAuthLinkedDriver(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  driverId: string
): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(driverId);
  return !error && !!data.user;
}

/** Link a legacy driver row (random UUID) to a new auth user + profile. */
async function migrateLegacyDriverToAuth(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  oldDriverId: string,
  data: DriverFormData
): Promise<{ userId: string } | { error: string }> {
  const { data: oldDriver, error: fetchError } = await admin
    .from("drivers")
    .select("*")
    .eq("id", oldDriverId)
    .single();

  if (fetchError || !oldDriver) {
    return { error: "Driver not found" };
  }

  const phoneError = await assertPhoneAvailable(admin, data.phone);
  if (phoneError) return { error: phoneError };

  const email = collectorAuthEmail(data.phone);
  const password = crypto.randomUUID() + crypto.randomUUID();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    phone: data.phone.trim(),
    user_metadata: {
      full_name: data.name.trim(),
      phone: data.phone.trim(),
      role: "collector",
    },
  });

  if (authError) return { error: authError.message };

  const newId = authData.user.id;
  const license = data.license_number.trim().toUpperCase();

  const { error: tempLicenseError } = await admin
    .from("drivers")
    .update({
      license_number: `${license}_LEGACY_${oldDriverId.slice(0, 8)}`,
    })
    .eq("id", oldDriverId);

  if (tempLicenseError) {
    await admin.auth.admin.deleteUser(newId);
    return { error: tempLicenseError.message };
  }

  const { error: insertError } = await admin.from("drivers").insert({
    id: newId,
    name: data.name.trim(),
    license_number: license,
    phone: data.phone.trim(),
    license_photo_path: data.license_photo_path,
    license_valid_till: data.license_valid_till,
    is_active: oldDriver.is_active,
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(newId);
    await admin
      .from("drivers")
      .update({ license_number: license })
      .eq("id", oldDriverId);
    return { error: insertError.message };
  }

  await admin.from("vehicle_drivers").update({ driver_id: newId }).eq("driver_id", oldDriverId);
  await admin.from("jobs").update({ driver_id: newId }).eq("driver_id", oldDriverId);

  const { error: deleteError } = await admin.from("drivers").delete().eq("id", oldDriverId);
  if (deleteError) {
    return { error: deleteError.message };
  }

  try {
    await upsertCollectorProfile(admin, newId, email, data);
    await syncAuthUser(admin, newId, data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create collector profile" };
  }

  return { userId: newId };
}

export async function createDriver(data: DriverFormData) {
  const result = await verifyAdmin();
  if (result.error) return { error: result.error };
  const admin = result.admin!;

  const license = data.license_number.trim().toUpperCase();

  const { data: existingLicense } = await admin
    .from("drivers")
    .select("id")
    .eq("license_number", license)
    .maybeSingle();

  if (existingLicense) {
    return { error: "A driver with this license number already exists" };
  }

  const phoneError = await assertPhoneAvailable(admin, data.phone);
  if (phoneError) return { error: phoneError };

  const email = collectorAuthEmail(data.phone);
  const password = crypto.randomUUID() + crypto.randomUUID();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    phone: data.phone.trim(),
    user_metadata: {
      full_name: data.name.trim(),
      phone: data.phone.trim(),
      role: "collector",
    },
  });

  if (authError) return { error: authError.message };

  const userId = authData.user.id;

  try {
    await upsertCollectorProfile(admin, userId, email, data);
  } catch (err) {
    await admin.auth.admin.deleteUser(userId);
    return { error: err instanceof Error ? err.message : "Failed to create collector profile" };
  }

  const { error: driverError } = await admin.from("drivers").insert({
    id: userId,
    name: data.name.trim(),
    license_number: license,
    phone: data.phone.trim(),
    license_photo_path: data.license_photo_path,
    license_valid_till: data.license_valid_till,
  });

  if (driverError) {
    await admin.auth.admin.deleteUser(userId);
    return { error: driverError.message };
  }

  return { success: true, userId };
}

export async function updateDriver(driverId: string, data: DriverFormData) {
  const result = await verifyAdmin();
  if (result.error) return { error: result.error };
  const admin = result.admin!;

  const linked = await isAuthLinkedDriver(admin, driverId);

  if (!linked) {
    const migrated = await migrateLegacyDriverToAuth(admin, driverId, data);
    if ("error" in migrated) return { error: migrated.error };
    return { success: true, userId: migrated.userId, migrated: true as const };
  }

  const phoneError = await assertPhoneAvailable(admin, data.phone, driverId);
  if (phoneError) return { error: phoneError };

  const { error: driverError } = await admin
    .from("drivers")
    .update({
      name: data.name.trim(),
      phone: data.phone.trim(),
      license_photo_path: data.license_photo_path,
      license_valid_till: data.license_valid_till,
    })
    .eq("id", driverId);

  if (driverError) return { error: driverError.message };

  try {
    await admin
      .from("profiles")
      .update({
        full_name: data.name.trim(),
        phone: data.phone.trim(),
        role: "collector",
      })
      .eq("id", driverId);

    await syncAuthUser(admin, driverId, data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update collector profile" };
  }

  return { success: true, userId: driverId };
}

// ── Owner CRUD ────────────────────────────────────────────────────────────────

export interface OwnerFormData {
  full_name: string;
  email: string;
  phone: string;
}

export async function createOwner(data: OwnerFormData) {
  const result = await verifyAdmin();
  if (result.error) return { error: result.error };
  const admin = result.admin!;

  const fullName = data.full_name.trim();
  const email = data.email.trim().toLowerCase();
  const phone = data.phone.trim();

  if (fullName.length < 2) return { error: "Name must be at least 2 characters" };
  if (!email.includes("@")) return { error: "Enter a valid email address" };

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: fullName, phone, role: "owner" },
  });

  if (authError) return { error: authError.message };

  const userId = authData.user.id;

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    email,
    full_name: fullName,
    phone,
    role: "owner",
    kyc_status: "verified",
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return { error: profileError.message };
  }

  return { success: true, userId };
}

export async function updateOwner(
  ownerId: string,
  data: Pick<OwnerFormData, "full_name" | "phone">
) {
  const result = await verifyAdmin();
  if (result.error) return { error: result.error };
  const admin = result.admin!;

  const fullName = data.full_name.trim();
  const phone = data.phone.trim();

  if (fullName.length < 2) return { error: "Name must be at least 2 characters" };

  const { error } = await admin
    .from("profiles")
    .update({ full_name: fullName, phone })
    .eq("id", ownerId);

  if (error) return { error: error.message };

  await admin.auth.admin.updateUserById(ownerId, {
    user_metadata: { full_name: fullName, phone },
  });

  return { success: true };
}

export async function deleteOwner(ownerId: string) {
  const result = await verifyAdmin();
  if (result.error) return { error: result.error };
  const admin = result.admin!;

  // Unassign all vehicles first
  await admin
    .from("vehicles")
    .update({ owner_id: null })
    .eq("owner_id", ownerId);

  // Delete auth user (cascades to profile via trigger)
  const { error } = await admin.auth.admin.deleteUser(ownerId);
  if (error) return { error: error.message };

  return { success: true };
}