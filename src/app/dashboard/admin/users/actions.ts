"use server";

import { verifyAdmin } from "@/lib/supabase/admin";
import { normalizeIndianPhone } from "@/lib/validators";

export interface BwgUserFormData {
  full_name: string;
  phone: string;
  city: string;
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
  excludeProfileId: string,
): Promise<string | null> {
  const variants = phoneVariants(phone);
  const { data: profileMatch } = await admin
    .from("profiles")
    .select("id")
    .in("phone", variants)
    .neq("id", excludeProfileId)
    .limit(1)
    .maybeSingle();

  if (profileMatch) {
    return "This phone number is already registered to another user";
  }
  return null;
}

export async function updateBwgUser(userId: string, data: BwgUserFormData) {
  const result = await verifyAdmin();
  if (result.error) return { error: result.error };
  const admin = result.admin!;

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (!profile || profile.role !== "bwg") {
    return { error: "User not found or is not a BWG account" };
  }

  const fullName = data.full_name.trim();
  if (fullName.length < 2) {
    return { error: "Name must be at least 2 characters" };
  }

  const normalizedPhone = normalizeIndianPhone(data.phone);
  if (!normalizedPhone) {
    return { error: "Enter a valid WhatsApp number in +919731296263 format" };
  }

  const phoneError = await assertPhoneAvailable(admin, normalizedPhone, userId);
  if (phoneError) return { error: phoneError };

  const city = data.city.trim() || "Bengaluru";

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      phone: normalizedPhone,
      city,
    })
    .eq("id", userId);

  if (profileError) return { error: profileError.message };

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { full_name: fullName, phone: normalizedPhone },
  });

  if (authError) return { error: authError.message };

  return { success: true };
}
