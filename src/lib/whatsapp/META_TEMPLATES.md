# Meta WhatsApp templates guide

Complete reference for creating all GreensBrowns WhatsApp templates in a new [Meta Business Suite](https://business.facebook.com/wa/manage/message-templates/) account.

Use **Utility** category where applicable. Language: `META_WA_TEMPLATE_LANG` (default `en`).

Template names must match `WA_TEMPLATE_NAMES` in `wa-templates.ts`. Button payloads must match `normalizeCollectorWhatsAppChoice` / `normalizeFarmerWhatsAppChoice` in the same file.

## Changes in the November 2026 UAT release (branch `fix-feedback-nov14`)

Create or edit these in WhatsApp Manager before deploying the release. Meta reviews new and edited templates, usually within minutes (up to 24h).

| Template | Action | Why |
|----------|--------|-----|
| `collector_pickup_first_reminder` | **Create** (Utility, no buttons) — see section 2 | Replaces the 24-hour reminder (UAT-2) |
| `bwg_quote_ready` | **Create** (Utility, 2 quick-reply buttons) — see section 25 | Guest accepts or rejects a quote before getting a payment link (UAT-5) |
| `bwg_payment_link` | **Edit** the body — see section 24 | Now sent after Accept Quote, and the link lasts 24 hours (UAT-5) |
| `collector_pickup_reminder_24h` | **Delete** after the release is live | No longer sent (UAT-2) |
| `collector_pickup_reminder_1h` | No change | Still carries Enroute and Breakdown |
| `bwg_pickup_cancelled_` | No change | Now also sent when a guest taps Reject Quote |

After the release the app uses 25 templates: 24 existing (minus the deleted 24-hour reminder) plus the 2 new ones.

---

## Meta templates for each message

| # | Meta template name | Recipient | When sent | Buttons | Source (`templates.ts`) |
|---|-------------------|-----------|-----------|---------|-------------------------|
| 1 | `collector_job_assigned` | Collector | Job confirmed / reassigned | **Accepted** | `jobAssignedMessage` |
| 2 | `collector_pickup_first_reminder` | Collector | 18h before the slot (12h for evening), or straight away for an urgent job | None | *(wa-templates only)* |
| 3 | `collector_pickup_reminder_1h` | Collector | 1h before pickup slot, or straight away if the job is created less than 1h before | **Enroute** · **Breakdown** | `pickupReminder1hMessage` |
| 4 | `admin_driver_not_accepted` | Admin | Collector did not accept within 120 min | None | *(wa-templates only)* |
| 5 | `admin_vehicle_breakdown` | Admin | Collector reports vehicle breakdown | None | `ADMIN_VEHICLE_BREAKDOWN_MESSAGE` |
| 6 | `bwg_vehicle_breakdown` | BWG | Collector reports vehicle breakdown | None | `bwgVehicleBreakdownMessage` |
| 7 | `bwg_pickup_requested` | BWG | Pickup scheduled (`requested`) | **Cancel** | `bwgPickupRequestedMessage` |
| 8 | `bwg_pickup_cancelled_` | BWG | Pickup cancelled before verification | None | `bwgPickupCancelledMessage` |
| 9 | `bwg_pickup_scheduled` | BWG | Job assigned to vehicle | None | `bwgPickupScheduledMessage` |
| 10 | `bwg_pickup_collected` | BWG | Collector confirms **full** pickup | None | *(wa-templates only)* |
| 11 | `bwg_pickup_partial` | BWG | Collector confirms **partial** pickup | None | `bwgPartialPickupMessage` |
| 12 | `admin_pickup_partial` | Admin | Collector confirms **partial** pickup | None | `ADMIN_PARTIAL_PICKUP_MESSAGE` |
| 13 | `bwg_delivery_confirmed` | BWG | Collector arrives at processor | None | `bwgDeliveryConfirmedMessage` |
| 14 | `farmer_delivery_incoming` | Processor | 24h before expected delivery | None | `farmerDeliveryIncomingMessage` |
| 15 | `farmer_delivery_eta` | Processor | After full or partial pickup | None | `farmerDeliveryETAMessage` |
| 16 | `farmer_delivery_confirm` | Processor | Collector arrives at processor | **Accepted** | `FARMER_CONFIRM_DELIVERY` |
| 17 | `farmer_auto_accepted` | Processor | Midnight cron, no response | None | `FARMER_AUTO_ACCEPTED` |
| 18 | `bwg_vehicle_arrived` | BWG | Collector taps Arrived at the BWG | None | *(wa-templates only)* |
| 19 | `bwg_no_show_warning_1` | BWG | 1st no-show (BWG Unavailable) | None | *(wa-templates only)* |
| 20 | `bwg_no_show_warning_2` | BWG | 2nd no-show — restriction warning | None | *(wa-templates only)* |
| 21 | `bwg_account_suspended` | BWG | 3rd no-show — account suspended | None | *(wa-templates only)* |
| 22 | `admin_bwg_no_show` | Admin | Collector reports BWG Unavailable (no-show) | None | *(wa-templates only)* |
| 23 | `admin_driver_no_show` | Admin | Driver accepted but never arrived by slot deadline | None | *(wa-templates only)* |
| 24 | `bwg_payment_link` | BWG (guest) | Guest taps **Accept Quote** | None | *(wa-templates only)* |
| 25 | `bwg_quote_ready` | BWG (guest) | Admin sends/resends a one-off pickup quote | **Accept Quote** · **Reject Quote** | *(wa-templates only)* |

**Not Meta templates:** Collector mid-flow buttons (Enroute → Arrived → Full/Partial → In Transit → Arrived) are **session interactive messages** sent via API within the 24h window. Prompt text: `COLLECTOR_ACTION_PROMPT` in `templates.ts`.

**Also not Meta templates:** The BWG self-service journeys (New Pickup / Pickup Status) below are **session interactive messages** — the customer opens the 24h window by sending `hi`/`pickup`, so no new approved templates are required. Only the final confirmation reuses the existing `bwg_pickup_requested` template.

---

## BWG self-service over WhatsApp (inbound, session messages)

A registered BWG can create a pickup or check status entirely over WhatsApp. The
customer initiates (sends `hi`, `hello`, `pickup`, or `menu`), which opens the 24h
customer-service window and lets us reply with free-form interactive messages.

Conversation state is persisted per phone in `whatsapp_conversations`
(`conversation-state.ts`); the engine lives in `bwg-conversation.ts`. State expires
after 1 hour of inactivity. Sending `hi`/`pickup` at any time restarts at the menu.

```
BWG → "hi" / "pickup"
  └─[Session buttons] "Hi {name}!"  New Pickup → wa_new_pickup · Pickup Status → wa_pickup_status

New Pickup (wa_new_pickup)
  1. [Session] Org confirm — org name(s) as buttons (≤3) or list (>3) → wa_org:<id>
       (aborts if org is suspended or has no prepaid credits)
  2. [Session list] next 10 bookable dates, e.g. "Monday, 17 Nov" → wa_date:<YYYY-MM-DD>
       (starts 2 days out, IST; typing DD/MM/YYYY still works)
  3. [Session buttons] "Date set…" Morning · Afternoon · Evening → wa_slot:<slot>
  4. [Session] "Send 2 photos of the waste" (collected one at a time → pickup-photos bucket)
  5. [Session] "Send any notes, or reply 'No' to skip"
  6. Creates pickup (status=requested, consumes 1 prepaid credit)
       └─[Meta] bwg_pickup_requested (Cancel button) — flow then continues as normal
         (admin verifies → schedules job → etc.)

Pickup Status (wa_pickup_status)
  └─[Session list] active pickups → wa_pk:<id>
       (excludes accepted / cancelled / bwg_unavailable + other terminal statuses; max 10)
       └─[Session text] Pickup number, date, slot, status, assigned vehicle
         (or "You have no active pickups.")
```

**Inbound payload reference (session, not templates):**

| Button / row | Payload | Handler step |
|--------------|---------|--------------|
| New Pickup | `wa_new_pickup` | start new-pickup flow |
| Pickup Status | `wa_pickup_status` | start status lookup |
| Org choice | `wa_org:<orgId>` | `choose_org` |
| Date row | `wa_date:<YYYY-MM-DD>` | `await_date` |
| Morning / Afternoon / Evening | `wa_slot:morning` / `:afternoon` / `:evening` | `await_slot` |
| Pickup row | `wa_pk:<pickupId>` | `choose_pickup` |

---

## Guest one-off pickups over WhatsApp (non-registered, inbound session messages)

A **non-registered** caller (no profile, org, prepaid credits, or service
agreement) can request a single one-off pickup over WhatsApp. The flow is kept
deliberately light — it is NOT a registration. The engine lives in
`guest-conversation.ts`; the commit in `guest-pickup.ts`.

To avoid org/profile bloat, every one-off pickup is attributed to a single
**system guest org** (`SYSTEM_GUEST_ORG_ID`) and a single **system guest profile**
(`SYSTEM_GUEST_PROFILE_ID`), both seeded by migration `00052`. The caller's real
identity (name, org name, address, GSTIN, location) is stored in
`guest_requests` (keyed by phone) so a returning guest is recognized and offered
their saved details.

Starting requires an explicit opt-in keyword (`pickup` / `new` / `start`) so we
never reply to random/spam texts. An in-progress guest conversation always
continues. State expires after 1 hour (`whatsapp_conversations`).

```
Non-registered → "pickup" (opt-in keyword required to start)
  ├─ Returning guest? [Session buttons] "Welcome back…" Use saved details → guest_reuse · Start fresh → guest_fresh
  │     (reuse jumps straight to the date step)
  └─ New guest:
     1. [Session] "What's your name?"
     2. [Session] "Organization / building / society name?"
     3. [Session] "Full pickup address?"
     4. [Session] "Share the pickup location" (WhatsApp Location button → lat/lng)
     5. [Session] "GSTIN, or reply 'No' to skip" (validated; 'no' skips)
     6. [Session list] next 10 bookable dates, e.g. "Monday, 17 Nov" → wa_date:<YYYY-MM-DD>
        (starts 2 days out, IST; typing DD/MM/YYYY still works)
     7. [Session buttons] Morning · Afternoon · Evening → wa_slot:<slot>
     8. [Session] "Send 2 photos of the waste" (collected → pickup-photos bucket under guest/)
     9. Creates pickup (status=requested, is_one_off=true, system guest org +
        system guest profile, no prepaid credit consumed) + a `payments` row
        (status=awaiting_quote). Requester identity stays in `guest_requests`.
          └─[Meta] bwg_pickup_requested (shows the guest's org name + pickup number)
              └─ Cancel → cancel_pickup: cancels the request ONLY while it is
                 still `requested` (before admin verification). After
                 verification the guest is told to contact support.

Abuse caps: per-phone & global daily one-off limits (abuse-guard.ts); duplicate
guard on (guest_request, date, slot) within 10 min; idempotency lock on commit.

Data model: requester name/phone/org/address/GSTIN live in `guest_requests`
(linked by `pickups.guest_request_id`), NOT duplicated on the pickup. Payment
details live in the `payments` table (one row per pickup), NOT on the pickup.
Only `pickup_lat`/`pickup_lng` are snapshotted on the pickup (for routing).
```

**Admin side (webapp `Pickups` page → One-Off Requests tab):** the **Send quote**
dialog shows the guest's address and map link, lists the active processors
nearest first with their road distance, and suggests a price for the selected
processor (cheapest vehicle type that can carry the volume: base fare + rate per
km × distance). The admin can change the amount, then sends `bwg_quote_ready`.
The selected processor is saved on the pickup (`farmer_id`). An interim
**"Verify (skip payment)"** action still moves a one-off request into the normal
job pipeline (it uses the captured `pickup_lat`/`pickup_lng` for routing). Payment status is read from
the `payments` table. Admins can block/unblock phone numbers from the **Blocked
Phones** tab.

**Inbound payload reference (session, not templates):**

| Button / row | Payload | Handler step |
|--------------|---------|--------------|
| Use saved details | `guest_reuse` | `confirm_returning` |
| Start fresh | `guest_fresh` | `confirm_returning` |
| Morning / Afternoon / Evening | `wa_slot:morning` / `:afternoon` / `:evening` | `await_slot` |
| Date row | `wa_date:<YYYY-MM-DD>` | `await_date` |
| Cancel (one-off template) | `cancel_pickup` | guest cancel (only while `requested`) |
| Accept Quote / Reject Quote (`bwg_quote_ready`) | `accept_quote` / `reject_quote` | guest quote response (only while `quote_sent`) |

---

## End-to-end flow

```
[Meta] bwg_pickup_requested  Cancel → cancel_pickup (BWG WhatsApp or app cancel)
         └─[Meta] bwg_pickup_cancelled_ (on cancel while requested)

[Meta] collector_job_assigned     Accepted → driver_accepted
         └─[Session text] "Accepted. You will get a reminder with the job details before pickup." (no buttons)

[Meta] bwg_pickup_scheduled (job assigned)

[Meta] collector_pickup_first_reminder (no buttons; 18h before, 12h for evening, or straight away for urgent jobs)

[Meta] collector_pickup_reminder_1h    Enroute → enroute · Breakdown → breakdown
         └─[Session] Arrived → arrived_bwg · Breakdown → breakdown

[Session] Full Pickup → full_pickup
         ├─ [Meta] bwg_pickup_collected + farmer_delivery_eta
         └─[Session] In Transit → in_transit

[Session] Partial Pickup → partial_pickup
         ├─ [Meta] bwg_pickup_partial + admin_pickup_partial + farmer_delivery_eta
         └─[Session] In Transit → in_transit
         (BWG/admin must schedule a new pickup for the remainder — no auto-duplicate)

[Session] Arrived → arrived_bwg
         ├─ [Meta] bwg_vehicle_arrived (BWG notified vehicle has arrived)
         └─[Session] Full Pickup → full_pickup · Partial Pickup → partial_pickup · BWG Unavailable → bwg_unavailable

[Session] BWG Unavailable → bwg_unavailable (no-show; pickup closed, no credit refund)
         ├─ vehicle released from job if it is the only grouped pickup
         ├─ [Meta] bwg_no_show_warning_1 (1st) / bwg_no_show_warning_2 (2nd) / bwg_account_suspended (3rd → org suspended)
         └─ [Meta] admin_bwg_no_show → admin instructs driver on next steps

[Session] Arrived → arrived_processor
         ├─ [Meta] bwg_delivery_confirmed
         └─ [Meta] farmer_delivery_confirm  Accepted → processor_accepted → accepted

[Meta] admin_driver_not_accepted → admin reassigns

[Meta] admin_vehicle_breakdown + bwg_vehicle_breakdown → admin reassigns

[Meta] farmer_auto_accepted (cron, no response by midnight)
```

---

## Button payload reference (must match code)

### Meta template buttons

| Template | Button label | Payload |
|----------|--------------|---------|
| `bwg_pickup_requested` | **Cancel** | `cancel_pickup` |
| `collector_job_assigned` | **Accepted** | `driver_accepted` |
| `collector_pickup_first_reminder` | *(none)* | — |
| `collector_pickup_reminder_1h` | **Enroute** · **Breakdown** | `enroute` · `breakdown` |
| `farmer_delivery_confirm` | **Accepted** | `processor_accepted` |
| `bwg_quote_ready` | **Accept Quote** · **Reject Quote** | `accept_quote` · `reject_quote` |

**Breakdown** is only accepted when pickup status is `driver_accepted` or `enroute` (not from `assigned`). If the collector taps Breakdown before accepting, they are prompted to accept first.

**Do not add to Meta:** Picked Up, In Transit, Delivered, Reject / Mixed waste / Capacity / Other. **No buttons on `collector_pickup_first_reminder`.**

### Session buttons (app — not Meta templates)

| After status | Button label(s) | Payload(s) |
|--------------|-----------------|------------|
| `driver_accepted` | *(none in the acceptance reply — Enroute and Breakdown arrive on the 1h reminder; if the driver messages again, Enroute · Breakdown are shown)* | `enroute` · `breakdown` |
| `enroute` | Arrived · Breakdown | `arrived_bwg` · `breakdown` |
| `arrived_bwg` | Full Pickup · Partial Pickup · BWG Unavailable | `full_pickup` · `partial_pickup` · `bwg_unavailable` |
| `full_pickup` or `partial_pickup` | In Transit | `in_transit` |
| `in_transit` | Arrived | `arrived_processor` |

Session prompt (first line of button message): `Tap a button to update your pickup status:`

---

## Body variables — footer rule

Existing variable numbers stay the same. The app appends Job ID, BWG name, and pickup date at the **bottom** via `appendWaContext()` in `pickup-context.ts` (fields already in the template body are skipped). Each template section below lists the final variable order sent to Meta.

**Slot labels** (code maps DB values to display text):

| DB value | Display |
|----------|---------|
| `morning` | Morning (6 AM - 12 PM) |
| `afternoon` | Afternoon (12 PM - 4 PM) |
| `evening` | Evening (4 PM - 8 PM) |

**Date format:** DD/MM/YYYY (`formatDateDDMMYYYY`).

---

## 1. `collector_job_assigned` (Collector)

**When sent:** Job confirmed, job reassigned to new vehicle, or collector sends random text while pickup is `assigned`.

| Button | Payload |
|--------|---------|
| **Accepted** | `driver_accepted` |

**Body variables:** 6

```
GreensBrowns — New job assigned.
Pickup from: {{1}}
Address: {{2}}
Date: {{3}}
Slot: {{4}}
Location: {{5}}

Job {{6}}
Please be ready
```

| Var | Maps to |
|-----|---------|
| {{1}} | BWG / organization name |
| {{2}} | BWG address |
| {{3}} | Pickup date (DD/MM/YYYY) |
| {{4}} | Time slot label |
| {{5}} | Google Maps link |
| {{6}} | Job number |

**Footer:** `GreensBrowns waste collection`

**Reference text (`jobAssignedMessage`):**
```
New job assigned!

Pickup from: {orgName}
Address: {address}
Date: {date}
Slot: {slot}

Location: {googleMapsLink}
```

---

## 2. `collector_pickup_first_reminder` (Collector)

**Status:** NEW — create in WhatsApp Manager. Replaces `collector_pickup_reminder_24h` (delete that one after release).

**Category:** Utility · **Language:** `en`

**When sent:** once per pickup, with the job details, before the 1-hour reminder:

| Time from job creation to slot start | First reminder | 1-hour reminder |
|---|---|---|
| More than 18h (12h for the evening slot) | 18h before the slot (12h for evening) | 1h before the slot |
| Between 1h and 18h (12h for evening) | Straight after `collector_job_assigned` | 1h before the slot |
| Less than 1h | Not sent | Straight after `collector_job_assigned` |

With slot starts of 06:00, 12:00 and 16:00 IST, the scheduled first reminders go at 12:00 IST (morning) and 18:00 IST (afternoon) the day before, and 04:00 IST on the day (evening).

**Buttons:** None. Enroute and Breakdown come on `collector_pickup_reminder_1h`.

**Body variables:** 6 (same order as `collector_job_assigned`)

```
GreensBrowns — Pickup reminder.
Pickup from: {{1}}
Address: {{2}}
Date: {{3}}
Slot: {{4}}
Location: {{5}}

Job {{6}}
You will get the Enroute and Breakdown buttons 1 hour before the slot.
```

| Var | Maps to | Sample for Meta review |
|-----|---------|------------------------|
| {{1}} | BWG / organization name | Brigade Gardenia |
| {{2}} | BWG address | 12 MG Road, Bengaluru |
| {{3}} | Pickup date (DD/MM/YYYY) | 17/11/2026 |
| {{4}} | Time slot label | Morning (6 AM - 12 PM) |
| {{5}} | Google Maps link | https://maps.google.com/?q=12.97,77.59 |
| {{6}} | Job number | JOB-20261117-0001 |

**Footer:** `GreensBrowns waste collection`

---

## 3. `collector_pickup_reminder_1h` (Collector)

**When sent:** 1 hour before the scheduled slot. If a job is created less than 1 hour before its slot, this is sent straight after `collector_job_assigned` (and no first reminder is sent).

| Button | Payload |
|--------|---------|
| **Enroute** | `enroute` |
| **Breakdown** | `breakdown` |

**Body variables:** 5

```
GreensBrowns — Reminder: Pickup in 1 hour at {{1}}.
Time slot: {{2}}
Location: {{3}}

Job {{4}} | Pickup {{5}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | BWG / organization name |
| {{2}} | Time slot label |
| {{3}} | Google Maps link |
| {{4}} | Job number |
| {{5}} | Pickup date (DD/MM/YYYY) |

**Footer:** `GreensBrowns waste collection`

**Reference text (`pickupReminder1hMessage`):**
```
Pickup in 1 hour at {orgName}
Slot: {slot}

Location: {googleMapsLink}
```

---

## 4. `admin_driver_not_accepted` (Admin)

**When sent:** Pickup stayed in `assigned` for 120+ minutes without collector tapping Accepted.

**Buttons:** None

**Body variables:** 4

```
GreensBrowns — Collector has not accepted the job within 2 hours.
BWG: {{1}}
Pickup date: {{2}}
Vehicle: {{3}}

Please reassign the job in the admin dashboard.

Job {{4}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | BWG name |
| {{2}} | Pickup date (DD/MM/YYYY) |
| {{3}} | Vehicle registration number |
| {{4}} | Job number |

Sent to all admin profiles with a phone number.

---

Sent to all admin profiles with a phone number.

---

## 5. `admin_vehicle_breakdown` (Admin)

**When sent:** Collector reports vehicle breakdown via WhatsApp (`status` → `breakdown`).

**Buttons:** None

**Body variables:** 4

```
GreensBrowns — Vehicle breakdown reported.
BWG: {{1}}
Pickup date: {{2}}
Vehicle: {{3}}

Please reassign the job in the admin dashboard.

Job {{4}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | BWG name |
| {{2}} | Pickup date (DD/MM/YYYY) |
| {{3}} | Vehicle registration number |
| {{4}} | Job number |

Sent to all admin profiles with a phone number.

---

## 6. `bwg_vehicle_breakdown` (BWG)

**When sent:** Collector reports vehicle breakdown via WhatsApp.

**Buttons:** None

**Body variables:** 5

```
GreensBrowns — Vehicle breakdown reported for your scheduled pickup.
Pickup {{1}} on {{2}} ({{3}}) cannot be completed by vehicle {{4}}.

We will reassign and notify you when a new vehicle is on the way.

Job {{5}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | Pickup number |
| {{2}} | Pickup date (DD/MM/YYYY) |
| {{3}} | Time slot label |
| {{4}} | Vehicle registration number |
| {{5}} | Job number |

---

## 7. `bwg_pickup_requested` (BWG)

**When sent:** BWG or admin schedules a pickup (`status: requested`).

| Button | Payload |
|--------|---------|
| **Cancel** | `cancel_pickup` |

**Body variables:** 4

```
Your pickup request has been received.
Request no.: {{1}}
Organization: {{2}}
Date: {{3}}
Slot: {{4}}

We will review and confirm your pickup. Tap Cancel below only if you want to withdraw this request (allowed until admin verification).
```

| Var | Maps to |
|-----|---------|
| {{1}} | Pickup number |
| {{2}} | Organization name |
| {{3}} | Scheduled date (DD/MM/YYYY) |
| {{4}} | Time slot label |

**Footer:** `GreensBrowns waste collection`

Tapping **Cancel** cancels the most recent `requested` pickup for the BWG's organization (same as app cancel).

**Reference text (`bwgPickupRequestedMessage`):** see `templates.ts`.

---

## 8. `bwg_pickup_cancelled_` (BWG)

**When sent:** Pickup cancelled while still `requested` (BWG app, admin app, or WhatsApp Cancel button).

**Buttons:** None

**Body variables:** 3

```
Your pickup request has been cancelled.
Request no.: {{1}}
Date: {{2}}
Slot: {{3}}

To schedule again, message us or use the GreensBrowns app.
```

| Var | Maps to |
|-----|---------|
| {{1}} | Pickup number |
| {{2}} | Scheduled date (DD/MM/YYYY) |
| {{3}} | Time slot label |

**Footer:** `GreensBrowns waste collection`

**Reference text (`bwgPickupCancelledMessage`):** see `templates.ts`.

---

## 9. `bwg_pickup_scheduled` (BWG)

**When sent:** Job assigned to vehicle (on job create / confirm).

**Buttons:** None

**Body variables:** 4

```
GreensBrowns — Pickup scheduled.
Date: {{1}}
Time slot: {{2}}

A vehicle has been assigned. You will be notified once the waste is collected and delivered.

Job {{3}} | {{4}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | Pickup date (DD/MM/YYYY) |
| {{2}} | Time slot label |
| {{3}} | Job number |
| {{4}} | BWG name |

**Reference text (`bwgPickupScheduledMessage`):**
```
GreensBrowns — Pickup scheduled
Date: {date}
Slot: {slot}

A vehicle has been assigned. You will be notified once the waste is delivered.
```

---

## 10. `bwg_pickup_collected` (BWG)

**When sent:** Collector taps **Full Pickup** only.

**Buttons:** None

**Body variables:** 4

```
GreensBrowns — Pickup completed.
Date: {{1}}
Time slot: {{2}}

The collector has picked up waste from your site.

Job {{3}} | {{4}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | Pickup date (DD/MM/YYYY) |
| {{2}} | Time slot label |
| {{3}} | Job number |
| {{4}} | BWG name |

---

## 11. `bwg_pickup_partial` (BWG)

**When sent:** Collector taps **Partial Pickup**.

**Buttons:** None

**Body variables:** 5

```
GreensBrowns — Partial pickup at your site.
Pickup {{1}} was only partially collected on {{2}} ({{3}}).

Please schedule a new pickup for the remaining waste in the app.

Job {{4}} | {{5}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | Pickup number |
| {{2}} | Pickup date (DD/MM/YYYY) |
| {{3}} | Time slot label |
| {{4}} | Job number |
| {{5}} | BWG name |

**Reference text (`bwgPartialPickupMessage`):**
```
GreensBrowns — Partial pickup at your site.
Pickup {pickupNumber} was only partially collected on {date} ({slot}).

Please schedule a new pickup for the remaining waste in the app.
```

---

## 12. `admin_pickup_partial` (Admin)

**When sent:** Collector taps **Partial Pickup** (same time as `bwg_pickup_partial`).

**Buttons:** None

**Body variables:** 4

```
GreensBrowns — Partial pickup reported.
Pickup {{1}} at {{2}} was only partially collected on {{3}}.

Please ensure the BWG schedules a new pickup, or create one in admin.

Job {{4}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | Pickup number |
| {{2}} | BWG name |
| {{3}} | Pickup date (DD/MM/YYYY) |
| {{4}} | Job number |

Sent to all admin profiles with a phone number.

**Reference text (`ADMIN_PARTIAL_PICKUP_MESSAGE`):**
```
Partial pickup reported. Please ensure the BWG schedules a new pickup, or create one in admin.
```

---

## 13. `bwg_delivery_confirmed` (BWG)

**When sent:** Collector taps Arrived at processor (`arrived_processor`).

**Buttons:** None

**Body variables:** 4

```
GreensBrowns — Delivery confirmed.
Your waste has been delivered to the processing facility.
Date: {{1}}
Time slot: {{2}}

Thank you for contributing to sustainable waste management!

Job {{3}} | {{4}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | Pickup date (DD/MM/YYYY) |
| {{2}} | Time slot label |
| {{3}} | Job number |
| {{4}} | BWG name |

**Reference text (`bwgDeliveryConfirmedMessage`):**
```
GreensBrowns — Delivery confirmed
Your waste from the pickup on {date} ({slot}) has been delivered to the composting facility.

Thank you for contributing to sustainable waste management!
```

---

## 14. `farmer_delivery_incoming` (Processor)

**When sent:** 24h before expected delivery (farmer/processor reminder cron).

**Buttons:** None

**Body variables:** 7

```
GreensBrowns — Delivery expected tomorrow.
Time slot: {{1}}
From: {{2}}
Estimated weight: {{3}}
Vehicle: {{4}}

Job {{5}} | {{6}} | Pickup {{7}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | Time slot label |
| {{2}} | Collector / driver name |
| {{3}} | Estimated weight (e.g. `120 kg`, or `TBD`) |
| {{4}} | Vehicle registration number |
| {{5}} | Job number |
| {{6}} | BWG name |
| {{7}} | Pickup date (DD/MM/YYYY) |

**Reference text (`farmerDeliveryIncomingMessage`):**
```
Delivery expected tomorrow
Slot: {slot}
From: {collectorName}
Est. {weightKg}kg.
Vehicle: {regNumber}
```

---

## 15. `farmer_delivery_eta` (Processor)

**When sent:** Collector taps Full Pickup or Partial Pickup.

**Buttons:** None

**Body variables:** 5

```
GreensBrowns — Waste picked up and heading to you.
ETA: ~{{1}} mins
Vehicle: {{2}}

Job {{3}} | {{4}} | Pickup {{5}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | ETA in minutes |
| {{2}} | Vehicle registration number |
| {{3}} | Job number |
| {{4}} | BWG name |
| {{5}} | Pickup date (DD/MM/YYYY) |

**Reference text (`farmerDeliveryETAMessage`):**
```
Waste picked up and heading to you.
ETA: ~{etaMinutes} mins
Vehicle: {regNumber}
```

---

## 16. `farmer_delivery_confirm` (Processor)

**When sent:** Collector arrives at processor (`arrived_processor`).

| Button | Payload |
|--------|---------|
| **Accepted** | `processor_accepted` |

**Body variables:** 3

```
GreensBrowns — Delivery has arrived. Tap Accepted to confirm receipt.

Job {{1}} | {{2}} | Pickup {{3}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | Job number |
| {{2}} | BWG name |
| {{3}} | Pickup date (DD/MM/YYYY) |

Sets pickup status to **`accepted`** when processor taps.

**Reference text (`FARMER_CONFIRM_DELIVERY`):**
```
Delivery arrived. Tap Accept to confirm receipt.
```

---

## 17. `farmer_auto_accepted` (Processor)

**When sent:** Midnight cron when processor has not responded to delivery confirm.

**Buttons:** None

**Body variables:** 3

```
GreensBrowns — No response received. Delivery has been marked as accepted.

Job {{1}} | {{2}} | Pickup {{3}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | Job number |
| {{2}} | BWG name |
| {{3}} | Pickup date (DD/MM/YYYY) |

**Reference text (`FARMER_AUTO_ACCEPTED`):**
```
No response received. Delivery has been marked as accepted.
```

---

## 18. `bwg_vehicle_arrived` (BWG)

**When sent:** Collector taps Arrived at the BWG (`arrived_bwg`).

**Buttons:** None

**Body variables:** 4

```
GreensBrowns — Your collection vehicle has arrived.
Please have your waste ready for handover.
Date: {{1}}
Time slot: {{2}}

Job {{3}} | {{4}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | Pickup date (DD/MM/YYYY) |
| {{2}} | Time slot label |
| {{3}} | Job number |
| {{4}} | BWG name |

**Footer:** `GreensBrowns waste collection`

---

## 19. `bwg_no_show_warning_1` (BWG)

**When sent:** First no-show — collector arrived but BWG was unavailable (`bwg_unavailable`, no_show_count = 1).

**Buttons:** None

**Body variables:** 4

```
GreensBrowns — Missed pickup.
Our collector arrived but no one was available to hand over the waste.
The pickup credit for this collection is not refunded.
Date: {{1}}
Time slot: {{2}}

This is your first recorded no-show. Repeated no-shows may lead to account suspension.

Job {{3}} | {{4}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | Pickup date (DD/MM/YYYY) |
| {{2}} | Time slot label |
| {{3}} | Job number |
| {{4}} | BWG name |

**Footer:** `GreensBrowns waste collection`

---

## 20. `bwg_no_show_warning_2` (BWG)

**When sent:** Second no-show (`bwg_unavailable`, no_show_count = 2) — account restriction warning.

**Buttons:** None

**Body variables:** 4

```
GreensBrowns — Second missed pickup.
Our collector again arrived but no one was available. The pickup credit is not refunded.
Date: {{1}}
Time slot: {{2}}

Warning: one more no-show will result in your organization's account being suspended, and you will not be able to schedule pickups or purchase plans.

Job {{3}} | {{4}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | Pickup date (DD/MM/YYYY) |
| {{2}} | Time slot label |
| {{3}} | Job number |
| {{4}} | BWG name |

**Footer:** `GreensBrowns waste collection`

---

## 21. `bwg_account_suspended` (BWG)

**When sent:** Third no-show (`bwg_unavailable`, no_show_count = 3) — organization account auto-suspended.

**Buttons:** None

**Body variables:** 4

```
GreensBrowns — Account suspended.
Following a third missed pickup, your organization's account has been suspended.
You can still log in, but you cannot schedule pickups or purchase plans until reactivated.
Date: {{1}}
Time slot: {{2}}

Please contact GreensBrowns support to restore your account.

Job {{3}} | {{4}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | Pickup date (DD/MM/YYYY) |
| {{2}} | Time slot label |
| {{3}} | Job number |
| {{4}} | BWG name |

**Footer:** `GreensBrowns waste collection`

---

## 22. `admin_bwg_no_show` (Admin)

**When sent:** Collector taps **BWG Unavailable** at the BWG (`bwg_unavailable`). Sent to all admin profiles with a phone number so they can instruct the driver on next steps.

**Buttons:** None

**Body variables:** 5

```
GreensBrowns — BWG no-show reported.
BWG: {{1}}
Pickup date: {{2}}
Vehicle: {{3}}
Recorded no-shows for this BWG: {{4}}

Pickup is closed. Please instruct the driver on next steps (next pickup, processor, or return).

Job {{5}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | BWG name |
| {{2}} | Pickup date (DD/MM/YYYY) |
| {{3}} | Vehicle registration number |
| {{4}} | Organization no-show count (1, 2, or 3) |
| {{5}} | Job number |

Sent to all admin profiles with a phone number.

---

## 23. `admin_driver_no_show` (Admin)

**When sent:** Driver accepted the job but did not mark **Arrived** at the BWG by the slot deadline (30 min after slot end: morning 12:30, afternoon 16:30, evening 20:30 IST). Pickup status → `driver_no_show`. Detected by the `driver-no-show` cron, which runs after each slot deadline (0 7 / 0 11 / 0 15 UTC). Sent to all admin profiles with a phone number.

**Buttons:** None

**Body variables:** 5

```
GreensBrowns — Driver no-show at BWG.
The driver did not turn up for the scheduled pickup.
BWG: {{1}}
Pickup date: {{2}}
Vehicle: {{3}}
Driver: {{4}}

Please arrange an alternate vehicle and reassign the job in the admin dashboard.

Job {{5}}
```

| Var | Maps to |
|-----|---------|
| {{1}} | BWG name |
| {{2}} | Pickup date (DD/MM/YYYY) |
| {{3}} | Vehicle registration number |
| {{4}} | Driver name |
| {{5}} | Job number |

Sent to all admin profiles with a phone number.

---

## 24. `bwg_payment_link` (BWG guest — one-off pickups)

**Status:** CHANGED — edit the body of the existing approved template (same name, same 3 variables). Editing sends it back to Meta review.

**When sent:** the guest taps **Accept Quote** on `bwg_quote_ready`. The app creates a Razorpay payment link that **expires after 24 hours** and sends its short URL. The pickup stays `requested` until payment succeeds.

**Buttons:** None (the URL is in the body; the guest taps it to open the hosted Razorpay page).

**Body variables:** 3

```
GreensBrowns — thank you for accepting the quote.
Pickup: {{1}}
Amount payable: {{2}}

Pay securely here: {{3}}

This link is valid for 24 hours. Your pickup is confirmed automatically once payment is received.
```

| Var | Maps to | Sample for Meta review |
|-----|---------|------------------------|
| {{1}} | Pickup number | GB-20261117-0001 |
| {{2}} | Amount (e.g. ₹1,500) | ₹1,500 |
| {{3}} | Razorpay payment link short URL | https://rzp.io/l/abc123 |

**Previous body (before this release):** "GreensBrowns — your one-off pickup quote is ready. … Pay securely here: {{3}} …". The variables did not change, so the old approved version keeps working until the edit is approved.

Sent to the guest's phone (resolved from `guest_requests.phone`).

**Payment lifecycle (`payments.status`):** `awaiting_quote → quote_sent → quoted → paid | failed | refunded`, or `quote_sent → quote_rejected` (pickup cancelled).
- **Send/Resend quote** (admin, `POST /api/admin/pickups/quote`): cancels any previous Razorpay link, saves the amount and processor, sets `payments.status='quote_sent'`, sends `bwg_quote_ready`. Pickup stays `requested`.
- **Accept Quote** (guest button, payload `accept_quote`): guarded update `quote_sent → quoted`, creates the Razorpay link with `expire_by` = now + 24h (unique `reference_id`), sends this template.
- **Reject Quote** (guest button, payload `reject_quote`): guarded update `quote_sent → quote_rejected`, pickup `requested → cancelled`, sends `bwg_pickup_cancelled_`, records a pickup event so admins see it on the Pickups page.
- **Paid** (`POST /api/webhooks/razorpay`, event `payment_link.paid`): guarded update `quoted → paid`, then pickup `requested → verified`. Idempotent (only a `quoted` row transitions).
- **Failed / expired / cancelled** (webhook): `quoted → failed`; pickup untouched; admin can resend the quote.
- `refunded` is a reserved status value; the refund flow is not built yet.

Razorpay webhook URL to register: `https://<domain>/api/webhooks/razorpay`. Env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

---

## 25. `bwg_quote_ready` (BWG guest — one-off pickups)

**Status:** NEW — create in WhatsApp Manager.

**Category:** Utility · **Language:** `en`

**When sent:** admin picks a processor and sends (or resends) the quote from the One-Off Requests tab. No payment link yet.

| Button (Quick reply) | Payload |
|----------------------|---------|
| **Accept Quote** | `accept_quote` |
| **Reject Quote** | `reject_quote` |

Button labels must be exactly `Accept Quote` and `Reject Quote` — the app maps the label text to the payload.

**Body variables:** 4

```
GreensBrowns — your one-off pickup quote.
Pickup: {{1}}
Date: {{2}}
Slot: {{3}}
Amount: {{4}}

Tap Accept Quote to get a payment link, or Reject Quote to cancel this pickup.
```

| Var | Maps to | Sample for Meta review |
|-----|---------|------------------------|
| {{1}} | Pickup number | GB-20261117-0001 |
| {{2}} | Pickup date (DD/MM/YYYY) | 19/11/2026 |
| {{3}} | Time slot label | Morning (6 AM - 12 PM) |
| {{4}} | Quote amount | ₹1,500 |

**Footer:** `GreensBrowns waste collection`

**Accept Quote** → `bwg_payment_link` (link valid 24 hours). **Reject Quote** → pickup cancelled and `bwg_pickup_cancelled_` sent. A button tapped after the quote was replaced or already answered gets a short session reply and changes nothing.

---

## Deprecated

- **`collector_pickup_reminder_24h`** — replaced by `collector_pickup_first_reminder` in the November 2026 release. Delete from WhatsApp Manager once the release is live.

- **`farmer_waste_processed`** — removed. Do not create in new Meta account.

---

## New Meta Business Suite setup checklist

1. Create all current templates above (sections 1–25, **25** in total) with exact names and variable counts.
2. Add buttons only on: `bwg_pickup_requested`, `collector_job_assigned`, `collector_pickup_reminder_1h`, `farmer_delivery_confirm`, `bwg_quote_ready`. The 1h reminder has two buttons: Enroute and Breakdown. `bwg_quote_ready` has two: Accept Quote and Reject Quote.
3. Set `META_WA_TEMPLATE_LANG` and WhatsApp API credentials in app environment.
4. Deploy app code.
5. Run Supabase migrations `00041`–`00058` if not already applied. (`00046` adds the `bwg_unavailable` status; `00047` adds org `no_show_count` / `is_active` and suspended-org guards; `00048` adds the `driver_no_show` status; `00049` adds `drivers.no_show_count`.)
6. Send a test message for each template via `/api/test/whatsapp-flow` or a staging pickup.

**Session BWG Unavailable button:** `BWG Unavailable` appears alongside Full Pickup / Partial Pickup after `arrived_bwg`. It is a session interactive button (not a Meta template), payload `bwg_unavailable`.
