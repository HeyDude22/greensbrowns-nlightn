-- Driver reminders (UAT-2, Nov 2026).
--
-- The 24-hour reminder is replaced by a "first reminder" (18h before the slot,
-- 12h for the evening slot, or straight away for urgent jobs). The 1-hour
-- reminder stays. Reminders are now sent when due rather than only at fixed
-- cron hours, so each pickup records when each reminder went out to avoid
-- sending it twice. Both are cleared whenever the pickup is (re)assigned.

ALTER TABLE public.pickups
  ADD COLUMN IF NOT EXISTS first_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent_at    TIMESTAMPTZ;
