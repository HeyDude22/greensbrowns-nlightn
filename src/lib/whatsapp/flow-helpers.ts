import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadMedia } from "./client";

/**
 * Helpers shared by the registered-BWG and guest one-off WhatsApp flows:
 * slot labels, IST-aware date parsing/validation, and waste-photo storage.
 */

export const SLOTS = ["morning", "afternoon", "evening"] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_TITLES: Record<string, string> = {
  morning: "Morning (6am - 12pm)",
  afternoon: "Afternoon (12pm - 4pm)",
  evening: "Evening (4pm - 8pm)",
};

export function slotTitle(slot: string | null): string {
  return slot ? SLOT_TITLES[slot] ?? slot : "TBD";
}

export function isSlot(value: string): value is Slot {
  return (SLOTS as readonly string[]).includes(value);
}

// --- Date helpers (IST: pickups must be >= 2 days from "today" in India) ---

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function minPickupDateISO(): string {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  ist.setUTCDate(ist.getUTCDate() + 2);
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(
    ist.getUTCDate(),
  )}`;
}

/** Parse DD/MM/YYYY (also D-M-YYYY, DD/MM/YY, YYYY-MM-DD) into yyyy-mm-dd. */
export function parseUserDate(input: string): string | null {
  const t = input.trim();
  let y: number, mo: number, d: number;

  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    y = +m[1];
    mo = +m[2];
    d = +m[3];
  } else if ((m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/))) {
    d = +m[1];
    mo = +m[2];
    y = +m[3];
  } else if ((m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/))) {
    d = +m[1];
    mo = +m[2];
    y = 2000 + +m[3];
  } else {
    return null;
  }

  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// --- Waste photo storage ---

function extensionForMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

/**
 * Download an inbound WhatsApp media item and upload it to the pickup-photos
 * bucket. `pathPrefix` namespaces the object (e.g. an org id or "guest").
 * Returns the public URL, or null on failure.
 */
export async function storeWastePhoto(
  supabase: SupabaseClient,
  mediaId: string,
  pathPrefix: string,
  mime: string,
): Promise<string | null> {
  try {
    const buffer = await downloadMedia(mediaId);
    const ext = extensionForMime(mime);
    const contentType = mime.startsWith("image/") ? mime : "image/jpeg";
    const fileName = `${pathPrefix}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from("pickup-photos")
      .upload(fileName, buffer, { contentType });
    if (error) {
      console.error("[WhatsApp] waste photo upload failed", {
        pathPrefix,
        error,
      });
      return null;
    }

    const { data } = supabase.storage
      .from("pickup-photos")
      .getPublicUrl(fileName);
    return data.publicUrl;
  } catch (err) {
    console.error("[WhatsApp] waste photo download/upload error", err);
    return null;
  }
}

/** Indian GSTIN: 2-digit state + 10-char PAN + entity + 'Z' + checksum. */
const GSTIN_RE =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGstin(value: string): boolean {
  return GSTIN_RE.test(value.trim().toUpperCase());
}
