# GreensBrowns — PRD Traceability (Internal Only)

**Purpose:** Map client-facing requirements in `docs/PRD-current-state.md` to implementation sources for engineers.  
**Not for client distribution.**  
**Last updated:** 2026-06-11

---

## Investigation sources

| Source | Location / method |
|--------|-------------------|
| Migrations | `supabase/migrations/00001` – `00037` |
| Live DB aggregates | `supabase db query --linked`, `supabase inspect db table-stats --linked` (project ref `hvmschkcvktouoboeyrq`) |
| Automated tests | None (`*.test.*` / `*.spec.*` = 0). E2E harness: `src/app/api/test/whatsapp-flow/route.ts` |
| Cron schedule | `vercel.json` |

---

## Role mapping (client doc ↔ code)

| Client PRD term | Code `user_role` | Primary UI / channel |
|-----------------|-------------------|----------------------|
| Waste Generator partner | `bwg` | Web dashboard `src/app/dashboard/bwg/**` |
| Platform administrator | `admin` | Web dashboard `src/app/dashboard/admin/**` |
| Collector | `collector` | WhatsApp `src/lib/whatsapp/handler.ts`; placeholder web `src/app/dashboard/collector/**` |
| Processor | `farmer` | WhatsApp `handler.ts`; placeholder web `src/app/dashboard/farmer/**` |

Role labels: `src/lib/constants.ts` (`ROLES`).

---

## Section 4.1 — Account creation and sign-in

| Behavior | Code / data |
|----------|-------------|
| Create Account screen | `src/app/(auth)/register/page.tsx` |
| Phone normalization `+91XXXXXXXXXX` | `src/lib/validators.ts` → `normalizeIndianPhone` (L3–10), `indianPhoneSchema` |
| Force role `bwg` on signup | Trigger `handle_new_user()` — migrations `00028_force_bwg_on_signup.sql`, `00037_bwg_signup_phone_metadata.sql` |
| Password ≥8 | `register/page.tsx` L29–32 |
| Duplicate email | `register/page.tsx` L59–63 (`identities.length === 0`) |
| Check Your Email screen | `src/app/(auth)/verify-otp/page.tsx` |
| Sign-in | `src/app/(auth)/login/page.tsx`, `src/components/auth/email-login-form.tsx` |
| Email confirm redirect | `src/app/(auth)/auth/callback/route.ts` |
| PKCE / cross-browser failure message | `auth/callback/route.ts` |
| Session + role routing | `src/middleware.ts` → `src/lib/supabase/middleware.ts` (L34–97) |
| Public vs protected routes | `middleware.ts` L35–38, L41–45, L48–84, L87–97 |

**Data:** `auth.users`, `profiles` (role, phone, full_name, email, kyc_status, city).

---

## Section 4.2 — Organization setup

| Behavior | Code / data |
|----------|-------------|
| Organization page | `src/app/dashboard/bwg/organization/page.tsx` |
| Org types enum | `org_type`: apartment, rwa, techpark — migration `00001`, `src/types/enums.ts` |
| Service agreement markdown | `src/lib/service-agreement.ts` (`SERVICE_AGREEMENT_MD`) |
| PDF generation + compliance insert | `organization/page.tsx` L127–204 (jsPDF, storage `compliance-docs`, `compliance_docs` insert `doc_type: agreement`) |
| Membership insert `role: admin` | `organization/page.tsx` L112–117 → `organization_members` |
| Sidebar lock until org | `src/components/layout/app-sidebar.tsx` L23–27, 49–65; `hasOrg` from `src/app/dashboard/layout.tsx` |
| Orphan org RLS | migration `00003_bwg_org_policies.sql` — SELECT for orgs without members |

**Data:** `organizations`, `organization_members`, `compliance_docs`, storage bucket `compliance-docs` (`00034`).

**Stub:** `notifyAgreementSigned` — `src/lib/notifications.ts` (console only).

---

## Section 4.3 — Scheduling a pickup

**Prepaid gate bug (client-confirmed):** Schedule Pickup does **not** query `assigned_packages` or require approved `prepaid_packages`. Submit only checks `orgId`, date, photos. `prepaid_package_id` is null when no active credits; amber banner L305–314 is non-blocking. **Intended:** block submission without prepaid coverage.

| Behavior | Code / data |
|----------|-------------|
| Schedule Pickup page | `src/app/dashboard/bwg/pickups/new/page.tsx` |
| Min date +2 days | L96–100, L212–214, L328–331 |
| Slots morning/afternoon/evening | L368–376 |
| Photos min 2 max 3, 2MB compress | L25–26, L28–67, L216–218 |
| Storage upload | bucket `pickup-photos`, path `{orgId}/...` L228–235 |
| Insert status `requested` | L247–261 |
| Pickup event | L269–275 |
| Prepaid auto-attach + increment | L111–124, L257–258, L277–283 |
| Vehicle availability hint | L130–164 (counts `vehicles` vs `pickups` on date) |
| `schedulePickupSchema` (unused recurrence in UI) | `src/lib/validators.ts` L30–37 |

**Data:** `pickups` (status, scheduled_date, scheduled_slot, waste_photo_urls, loading_helper_required, prepaid_package_id, notes), `pickup_events`, `prepaid_packages.used_count`.

**Trigger:** `generate_pickup_number()` → `GB-YYYYMMDD-XXXX` — `00001`.

---

## Section 4.4 — Cancelling a pickup

| Behavior | Code / data |
|----------|-------------|
| Cancel requested only | `src/app/dashboard/bwg/pickups/[id]/page.tsx` L184–216 |
| Status → `cancelled` | L197–198 |

---

## Section 4.5 — Platform verification

| Behavior | Code / data |
|----------|-------------|
| Verify dialog | `src/app/dashboard/admin/pickups/page.tsx` L256–305 |
| Status → `verified`, weight/volume | L270–276 |

---

## Section 4.6 — Job planning and dispatch

| Behavior | Code / data |
|----------|-------------|
| Job optimizer | `src/lib/job-optimizer.ts` (DBSCAN, haversine, capacity, rates) |
| Admin suggest jobs UI | `src/app/dashboard/admin/pickups/page.tsx` L307+ |
| Admin jobs page | `src/app/dashboard/admin/jobs/page.tsx` |
| Create job | `src/lib/create-job.ts` |
| Job number `JOB-YYYYMMDD-XXXX` | `create-job.ts` L25–32 |
| Draft skips pickup update | `create-job.ts` L62–65 |
| Assign pickups `assigned` + vehicle/farmer | L67–71 |
| Pickup events | L73–81 |
| WhatsApp notify | L83–88 → `POST /api/notify/job-assigned` |
| Notify handler | `src/app/api/notify/job-assigned/route.ts` → `src/lib/whatsapp/notifications.ts` |
| Nearby verified pickups RPC | `nearby_pending_pickups()` — migrations `00016`, `00024`, `00030` (filter `status = verified`) |
| Vehicle busy on job date | `admin/pickups/page.tsx` L330–334, statuses draft/pending/dispatched/in_progress |

**Data:** `jobs`, `job_pickups`, `pickups`, `vehicles`, `vehicle_drivers`, `drivers`, `vehicle_type_rates`, `farmer_details`.

**Live DB:** All 13 jobs `status = pending` (queried 2026-06-11). No code updates job status beyond insert observed in grep.

---

## Section 4.7 — Collector WhatsApp workflow

| Behavior | Code / data |
|----------|-------------|
| Webhook ingress | `src/app/api/webhooks/whatsapp/route.ts` |
| Handler | `src/lib/whatsapp/handler.ts` |
| Phone → profile | `findProfileByPhone` L76–95 |
| Collector → driver → vehicle → pickup | `findPickupForCollectorByStatus` L97–139 |
| Picked up + photo | `handleCollectorPhoto` L208–300, stage `assigned` → `picked_up` |
| In transit | `markPickupInTransit` L141–166; button L549–563 |
| Delivered + photo | stage `delivery` → `delivered`, `delivered_at` |
| Farmer ETA | `notifyFarmerETA` L302–400, Google Distance Matrix |
| BWG delivery WhatsApp | `sendBwgDeliveryWhatsApp` in `notifications.ts` |
| Reply dispatch | `src/lib/whatsapp/replies.ts` |
| Meta API client | `src/lib/whatsapp/client.ts` |
| Templates (session) | `src/lib/whatsapp/templates.ts` |
| Approved templates | `src/lib/whatsapp/wa-templates.ts` |
| `pendingAction` Map (in-memory) | `handler.ts` L525, L541–590 |

**Auto in-transit cron:** `src/lib/pickup-status.ts` → `src/app/api/cron/pickup-in-transit/route.ts` — **NOT in `vercel.json`**.

**Legacy alternate webhook:** `supabase/functions/whatsapp-webhook/index.ts` (Twilio + Meta).

---

## Section 4.8 — Processor WhatsApp workflow

| Behavior | Code / data |
|----------|-------------|
| Farmer branch | `handler.ts` L611–632 |
| Received / rejected | `handleFarmerResponse` L440–502 |
| Rejection reasons | `rejectionMap` L450–456 → `mixed_waste`, `capacity_full`, `other` |
| Waste processed | `handleFarmerWasteProcessed` L504–523 |
| Template choice normalize | `src/lib/whatsapp/wa-templates.ts` → `normalizeFarmerWhatsAppChoice` |
| Midnight auto-accept | `src/app/api/cron/auto-accept/route.ts` — cron `30 18 * * *` UTC in `vercel.json` |
| Fields | `pickups.farmer_responded_at`, `rejection_reason`, `delivered_at` — migration `00035` |

---

## Section 4.9 — Admin override

| Behavior | Code / data |
|----------|-------------|
| Mark delivered/processed list | `src/app/dashboard/admin/pickups/page.tsx` L196–254 |
| Mark delivered/processed detail | `src/app/dashboard/admin/pickups/[id]/page.tsx` |

---

## Section 4.10 — Reminders

| Behavior | Code / data |
|----------|-------------|
| Cron route | `src/app/api/cron/reminders/route.ts` |
| IST hour logic | L10–20 |
| Send logic | `src/lib/whatsapp/notifications.ts` → `sendPickupReminders` L75–219 |
| Slot starts: 6/12/16 | `notifications.ts` |
| Crons | `vercel.json` — 6× `/api/cron/reminders` |

---

## Section 4.11 — Prepaid packages

| Behavior | Code / data |
|----------|-------------|
| BWG prepaid page | `src/app/dashboard/bwg/prepaid/page.tsx` |
| Admin org prepaid | `src/app/dashboard/admin/organizations/page.tsx` |
| Plan templates CRUD | `src/app/dashboard/admin/setup/prepaid-packages/page.tsx` |
| Guard canRequestNew | `prepaid/page.tsx` L104–127, L152–157 |
| Request insert pending | L85–91 |

**Data:** `prepaid_package_plans`, `assigned_packages` (price_paise per org), `prepaid_packages` (status enum: pending/approved/rejected/expired). Plan price removed from template in `00007`.

---

## Section 4.12 — Compliance documents

| Behavior | Code / data |
|----------|-------------|
| BWG list | `src/app/dashboard/bwg/compliance/page.tsx` |
| Doc types | `compliance_doc_type` enum — `00001`, +agreement `00004` |
| Manifest generation | `src/app/dashboard/admin/pickups/[id]/page.tsx` (manifest insert) |

---

## Section 4.13 — Processor & collector admin setup

| Behavior | Code / data |
|----------|-------------|
| createFarmer / updateFarmer | `src/app/dashboard/admin/farmers/actions.ts` |
| Synthetic email | `processor.{digits}.{uuid8}@greensbrowns.local` |
| createDriver / updateDriver | `src/app/dashboard/admin/setup/collector-vehicles/actions.ts` |
| Vehicles UI | `src/app/dashboard/admin/setup/collector-vehicles/page.tsx`, `_vehicles-tab.tsx`, `_drivers-tab.tsx` |
| OCR RC / DL | `src/lib/ocr.ts` |
| verifyAdmin | `src/lib/supabase/admin.ts` |

**Data:** `farmer_details` (+ `processor_type` `00032`), `drivers` (FK auth.users `00036` NOT VALID), `vehicle_drivers`, `vehicles`, `vehicle_documents`.

---

## Section 4.14 — KYC

| Behavior | Code / data |
|----------|-------------|
| Upload form | `src/components/shared/kyc-upload-form.tsx` → kyc_status submitted |
| Admin review | `src/components/shared/kyc-review-dialog.tsx` |
| Profile page | `src/app/dashboard/profile/page.tsx` |
| Storage | bucket `kyc-documents` (`00034`) |

**Drift:** `profiles.kyc_notes` in `src/types/database.types.ts` and UI — **no migration** in `supabase/migrations/`.

---

## Section 4.15 — Ratings

| Behavior | Code / data |
|----------|-------------|
| Rating form | `src/components/shared/rating-form.tsx` |
| Table + RLS | migration `00031_pickup_ratings.sql` |
| Live count | 0 rows (2026-06-11) |

---

## Section 4.16 — Reports & ops dashboard

| Behavior | Code / data |
|----------|-------------|
| Admin dashboard | `src/app/dashboard/admin/page.tsx` |
| PIPELINE_STATUSES omits verified/received | L31–38 |
| Realtime | `src/hooks/use-realtime.ts` — publication on pickups, pickup_events, pickup_trips |
| Reports | `src/app/dashboard/admin/reports/page.tsx` |

---

## Section 4.17 — Payments

| Behavior | Code / data |
|----------|-------------|
| Razorpay one-off payment links | send/resend `src/app/api/admin/pickups/quote/route.ts`; webhook `src/app/api/webhooks/razorpay/route.ts`; client `src/lib/razorpay.ts`; `payments` table (`00055`/`00056`) |
| Invoice/subscription schema only | `00001` — `invoices`, `subscriptions`; 0 live rows |
| Pay-per-pickup copy | `bwg/pickups/new/page.tsx` L305–314 |

---

## Section 4.18 — Support

| Behavior | Code / data |
|----------|-------------|
| Table only | `support_tickets` in `00001`; 0 rows; no UI references |

---

## Screen inventory ↔ routes

| Client screen name | Route | File |
|--------------------|-------|------|
| Home page | `/` | `src/app/page.tsx` |
| Sign-in | `/login` | `src/app/(auth)/login/page.tsx` |
| Create Account | `/register` | `src/app/(auth)/register/page.tsx` |
| Check Your Email | `/verify-otp` | `src/app/(auth)/verify-otp/page.tsx` |
| Generator Dashboard | `/dashboard/bwg` | `src/app/dashboard/bwg/page.tsx` |
| Organization | `/dashboard/bwg/organization` | `src/app/dashboard/bwg/organization/page.tsx` |
| Pickups list | `/dashboard/bwg/pickups` | `src/app/dashboard/bwg/pickups/page.tsx` |
| Schedule Pickup | `/dashboard/bwg/pickups/new` | `src/app/dashboard/bwg/pickups/new/page.tsx` |
| Pickup Detail (BWG) | `/dashboard/bwg/pickups/[id]` | `src/app/dashboard/bwg/pickups/[id]/page.tsx` |
| Compliance Documents | `/dashboard/bwg/compliance` | `src/app/dashboard/bwg/compliance/page.tsx` |
| Prepaid Packages | `/dashboard/bwg/prepaid` | `src/app/dashboard/bwg/prepaid/page.tsx` |
| Operations Dashboard | `/dashboard/admin` | `src/app/dashboard/admin/page.tsx` |
| Users | `/dashboard/admin/users` | `src/app/dashboard/admin/users/page.tsx` |
| Pickups (admin) | `/dashboard/admin/pickups` | `src/app/dashboard/admin/pickups/page.tsx` |
| Pickup Detail (admin) | `/dashboard/admin/pickups/[id]` | `src/app/dashboard/admin/pickups/[id]/page.tsx` |
| Jobs | `/dashboard/admin/jobs` | `src/app/dashboard/admin/jobs/page.tsx` |
| Organizations | `/dashboard/admin/organizations` | `src/app/dashboard/admin/organizations/page.tsx` |
| Processors | `/dashboard/admin/farmers` | `src/app/dashboard/admin/farmers/page.tsx` |
| Reports | `/dashboard/admin/reports` | `src/app/dashboard/admin/reports/page.tsx` |
| Prepaid Plans setup | `/dashboard/admin/setup/prepaid-packages` | `src/app/dashboard/admin/setup/prepaid-packages/page.tsx` |
| Pickup Pricing setup | `/dashboard/admin/setup/pricing` | `src/app/dashboard/admin/setup/pricing/page.tsx` (stub) |
| Collector Vehicles setup | `/dashboard/admin/setup/collector-vehicles` | `src/app/dashboard/admin/setup/collector-vehicles/page.tsx` |
| My Profile | `/dashboard/profile` | `src/app/dashboard/profile/page.tsx` |
| Collector placeholders | `/dashboard/collector/**` | `src/app/dashboard/collector/**` |
| Processor placeholders | `/dashboard/farmer/**` | `src/app/dashboard/farmer/**` |

Navigation: `src/lib/constants.ts` (`NAV_ITEMS`, `ADMIN_NAV_GROUPS`), `src/components/layout/app-sidebar.tsx`.

---

## Background jobs ↔ routes

| Job | Route | Schedule (`vercel.json`) | Auth |
|-----|-------|--------------------------|------|
| Reminders | `GET /api/cron/reminders` | 6× daily UTC (IST 5/6, 11/12, 15/16) | `Bearer CRON_SECRET` |
| Auto-accept | `GET /api/cron/auto-accept` | `30 18 * * *` | CRON_SECRET |
| Daily jobs email | `GET /api/cron/daily-jobs` | `30 12 * * *` | CRON_SECRET |
| Pickup in-transit | `GET /api/cron/pickup-in-transit` | **Not scheduled** | CRON_SECRET |
| Job assigned notify | `POST /api/notify/job-assigned` | On job create | **None** |
| WhatsApp test | `GET /api/test/whatsapp-flow` | Manual | CRON_SECRET |

---

## Pickup status lifecycle (code-enforced transitions)

| From | To | Actor | Source |
|------|-----|-------|--------|
| — | requested | BWG | `bwg/pickups/new/page.tsx` |
| requested | verified | Admin | `admin/pickups/page.tsx` |
| requested | cancelled | BWG | `bwg/pickups/[id]/page.tsx` |
| verified | assigned | Job create | `create-job.ts` |
| assigned | picked_up | Collector WA | `whatsapp/handler.ts` |
| picked_up | in_transit | Collector WA or cron | `handler.ts`, `pickup-status.ts` |
| picked_up/in_transit | delivered | Collector WA | `handler.ts` |
| delivered | received | Farmer WA or cron | `handler.ts`, `auto-accept/route.ts` |
| delivered | rejected | Farmer WA | `handler.ts` |
| received/rejected | processed | Farmer WA or admin | `handler.ts`, `admin/pickups` |

**Live pickup status counts (2026-06-11):** processed 8, received 2, verified 2, assigned 2, cancelled 1, requested 1, rejected 1, scheduled 1. None: picked_up, in_transit, delivered at query time.

**Enum full list:** `src/types/enums.ts` `PickupStatus`; DB enum extended in `00023`, `00035`.

---

## Job status lifecycle

**Enum:** `draft`, `pending`, `dispatched`, `in_progress`, `completed`, `cancelled` — `00016`, `00025`.

**Code:** Created as `pending` or `draft` in `create-job.ts`. No transition handlers found.

**Live:** 13/13 `pending`.

---

## Live DB snapshot (aggregates)

| Table | ~Rows |
|-------|-------|
| profiles | 13 |
| organizations | 4 |
| pickups | 18 |
| pickup_events | 101 |
| jobs | 13 |
| vehicles | 14 |
| drivers | 4 |
| farmer_details | 2 |
| prepaid_packages | 1 |
| pickup_trips | 0 |
| pickup_ratings | 0 |
| invoices | 0 |
| support_tickets | 0 |

Profile roles (live): 4 bwg, 6 collector, 2 farmer, 1 admin.

---

## Open questions ↔ technical notes

| Client PRD §7 item | Technical detail |
| Pickup without prepaid (bug) | `new/page.tsx` handleSubmit L209–290: no `assigned_packages` check; optional `prepaidPackage` from approved `prepaid_packages` only; insert allows `prepaid_package_id: null`. Admin schedule dialog in `admin/pickups/page.tsx` also has no prepaid grep match. |
| Prepaid not returned on cancel | No decrement on cancel in `bwg/pickups/[id]/page.tsx`; increment in `new/page.tsx` L277–283 |
| Prepaid at schedule time | Same increment path |
| Auto in-transit may not run | Route exists; missing from `vercel.json` |
| Reject then process prompt | `handleFarmerResponse` calls `notifyFarmerWasteProcessed` after reject L495 |
| Photo upload edge case | `new/page.tsx` L236–238 continues on upload error |
| Job status stuck pending | Grep shows no `.update` on `jobs.status` |
| Legacy scheduled pickup | 1 row in DB; default was `scheduled` in `00001`, UI uses `requested` |
| Sidebar lock only | No middleware block; `app-sidebar.tsx` only |
| Pipeline omits verified | `admin/page.tsx` PIPELINE_STATUSES |
| Unauthenticated notify | `notify/job-assigned/route.ts` no auth |
| WhatsApp webhook spoofing | No Meta signature verify on POST |
| kyc_notes drift | UI/types only |
| pickup_trips unused | 0 rows; handler uses photo_before/after on pickup |
| recurrence unused in UI | DB column + validator; not in schedule form |

---

## Environment variables (reference)

See `.env.local.example`: Supabase URL/keys, `NEXT_PUBLIC_APP_URL`, Meta WhatsApp, Google Maps, SMTP, `CRON_SECRET`, legacy Twilio vars.

---

## E2E test harness steps (implicit requirements)

`src/app/api/test/whatsapp-flow/route.ts` documents expected flow:

`seed` → `job-assigned` → `picked-up-prompt` → `picked-up-photo` → `delivered-prompt` → `delivered-photo` → `farmer-received` → `farmer-rejected` → `auto-accept` → `cleanup`

Use as acceptance test checklist for rebuild.

---

*Maintained alongside `docs/PRD-current-state.md`. Update both when behavior changes.*
