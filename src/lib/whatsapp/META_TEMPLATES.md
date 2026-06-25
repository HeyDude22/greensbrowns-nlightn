# Meta WhatsApp templates guide

Complete reference for creating all GreensBrowns WhatsApp templates in a new [Meta Business Suite](https://business.facebook.com/wa/manage/message-templates/) account.

Use **Utility** category where applicable. Language: `META_WA_TEMPLATE_LANG` (default `en`).

Template names must match `WA_TEMPLATE_NAMES` in `wa-templates.ts`. Button payloads must match `normalizeCollectorWhatsAppChoice` / `normalizeFarmerWhatsAppChoice` in the same file.

---

## Meta templates for each message

| # | Meta template name | Recipient | When sent | Buttons | Source (`templates.ts`) |
|---|-------------------|-----------|-----------|---------|-------------------------|
| 1 | `collector_job_assigned` | Collector | Job confirmed / reassigned | **Accepted** | `jobAssignedMessage` |
| 2 | `collector_pickup_reminder_24h` | Collector | 24h before pickup slot | None | `pickupReminder24hMessage` |
| 3 | `collector_pickup_reminder_1h` | Collector | 1h before pickup slot | **Enroute** · **Breakdown** | `pickupReminder1hMessage` |
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

**Not Meta templates:** Collector mid-flow buttons (Enroute → Arrived → Full/Partial → In Transit → Arrived) are **session interactive messages** sent via API within the 24h window. Prompt text: `COLLECTOR_ACTION_PROMPT` in `templates.ts`.

---

## End-to-end flow

```
[Meta] bwg_pickup_requested  Cancel → cancel_pickup (BWG WhatsApp or app cancel)
         └─[Meta] bwg_pickup_cancelled_ (on cancel while requested)

[Meta] collector_job_assigned     Accepted → driver_accepted
         └─[Session] Enroute → enroute · Breakdown → breakdown

[Meta] bwg_pickup_scheduled (job assigned)

[Meta] collector_pickup_reminder_24h   (no buttons)

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
         └─ [Meta] bwg_no_show_warning_1 (1st) / bwg_no_show_warning_2 (2nd) / bwg_account_suspended (3rd → org suspended)

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
| `collector_pickup_reminder_24h` | *(none)* | — |
| `collector_pickup_reminder_1h` | **Enroute** · **Breakdown** | `enroute` · `breakdown` |
| `farmer_delivery_confirm` | **Accepted** | `processor_accepted` |

**Breakdown** is only accepted when pickup status is `driver_accepted` or `enroute` (not from `assigned`). If the collector taps Breakdown before accepting, they are prompted to accept first.

**Do not add to Meta:** Picked Up, In Transit, Delivered, Reject / Mixed waste / Capacity / Other. **No Enroute button on `collector_pickup_reminder_24h`.**

### Session buttons (app — not Meta templates)

| After status | Button label(s) | Payload(s) |
|--------------|-----------------|------------|
| `driver_accepted` | Enroute · Breakdown | `enroute` · `breakdown` |
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

## 2. `collector_pickup_reminder_24h` (Collector)

**When sent:** 24 hours before scheduled pickup slot.

**Buttons:** None

**Body variables:** 5

```
GreensBrowns — Reminder: Pickup tomorrow at {{1}}.
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

**Reference text (`pickupReminder24hMessage`):**
```
Reminder: Pickup tomorrow at {orgName}
Slot: {slot}

Location: {googleMapsLink}
```

---

## 3. `collector_pickup_reminder_1h` (Collector)

**When sent:** 1 hour before scheduled pickup slot.

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

## Deprecated

- **`farmer_waste_processed`** — removed. Do not create in new Meta account.

---

## New Meta Business Suite setup checklist

1. Create all **21** templates above with exact names and variable counts.
2. Add buttons only on: `bwg_pickup_requested`, `collector_job_assigned`, `collector_pickup_reminder_1h`, `farmer_delivery_confirm`. The 1h reminder has two buttons: Enroute and Breakdown.
3. Set `META_WA_TEMPLATE_LANG` and WhatsApp API credentials in app environment.
4. Deploy app code.
5. Run Supabase migrations `00041`–`00047` if not already applied. (`00046` adds the `bwg_unavailable` status; `00047` adds org `no_show_count` / `is_active` and suspended-org guards.)
6. Send a test message for each template via `/api/test/whatsapp-flow` or a staging pickup.

**Session BWG Unavailable button:** `BWG Unavailable` appears alongside Full Pickup / Partial Pickup after `arrived_bwg`. It is a session interactive button (not a Meta template), payload `bwg_unavailable`.
