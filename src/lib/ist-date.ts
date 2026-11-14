/**
 * Date helpers in India Standard Time (UTC+5:30, no daylight saving).
 *
 * Pickup dates are stored as plain YYYY-MM-DD strings that mean an IST
 * calendar day, so "today" must be computed in IST, not with toISOString()
 * (which gives the UTC date and is a day behind between 00:00 and 05:30 IST).
 */

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Slot start hour in IST for each pickup slot. */
export const SLOT_START_HOUR_IST: Record<string, number> = {
  morning: 6,
  afternoon: 12,
  evening: 16,
};

/** Jobs can only be created for pickups dated today or the next 2 days (48 hours, by date). */
export const JOB_WINDOW_DAYS = 2;

/** Today's date in IST as YYYY-MM-DD. */
export function todayIst(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Add whole days to a YYYY-MM-DD date string. */
export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Last pickup date a job may be created for today (today + JOB_WINDOW_DAYS). */
export function jobWindowEndIst(now: Date = new Date()): string {
  return addDaysIso(todayIst(now), JOB_WINDOW_DAYS);
}

/** True when a job may be created for this pickup or job date (on or before today + 2 days). */
export function isWithinJobWindow(date: string, now: Date = new Date()): boolean {
  return date <= jobWindowEndIst(now);
}

/** The instant a pickup slot starts, or null for an unknown slot. */
export function slotStartUtc(date: string, slot: string | null): Date | null {
  if (!slot || !(slot in SLOT_START_HOUR_IST)) return null;
  const hour = SLOT_START_HOUR_IST[slot];
  return new Date(Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`) - IST_OFFSET_MS);
}
