import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateDDMMYYYY } from "@/lib/utils";
import {
  PICKUP_TERMINAL_STATUSES,
  pickupStatusLabel,
} from "@/lib/pickup-status-flow";
import { selectFifoPrepaidPackage } from "@/lib/prepaid-credits";
import { normalizeBwgWhatsAppChoice } from "./wa-templates";
import {
  sendBwgPickupRequestedWhatsApp,
  sendBwgPickupCancelledWhatsApp,
} from "./notifications";
import {
  getConversation,
  setConversation,
  updateConversation,
  clearConversation,
  clearConversationWithPhotos,
  claimConversationStep,
  type ConversationState,
} from "./conversation-state";
import {
  BWG_MENU_BUTTONS,
  BWG_SLOT_BUTTONS,
  type WhatsAppButton,
  type WhatsAppHandlerReply,
} from "./types";
import {
  SLOTS,
  type Slot,
  slotTitle,
  minPickupDateISO,
  parseUserDate,
  storeWastePhoto,
} from "./flow-helpers";

/** Normalized inbound message handed to the BWG conversation engine. */
export interface BwgIncoming {
  phone: string;
  profileId: string;
  profileName: string | null;
  text: string;
  buttonPayload: string;
  mediaId: string;
  mediaType: string;
}

const GREETINGS = new Set([
  "hi",
  "hii",
  "hello",
  "helo",
  "hey",
  "pickup",
  "menu",
  "start",
  "new pickup",
]);

/** Pickups in these statuses are no longer active for the BWG to track. */
const INACTIVE_STATUSES = [...PICKUP_TERMINAL_STATUSES, "accepted"];

function text(message: string): WhatsAppHandlerReply {
  return { kind: "text", message };
}

// --- Organization + credit lookups ---

interface OrgRef {
  id: string;
  name: string;
}

async function getUserOrgs(
  supabase: SupabaseClient,
  profileId: string,
): Promise<OrgRef[]> {
  const { data } = await supabase
    .from("organization_members")
    .select("organizations(id, name)")
    .eq("user_id", profileId);

  const orgs = (data ?? [])
    .map((row) => (row.organizations as unknown as OrgRef | null))
    .filter((o): o is OrgRef => !!o?.id);

  // De-dupe in case of multiple memberships to the same org.
  const seen = new Set<string>();
  return orgs.filter((o) => (seen.has(o.id) ? false : seen.add(o.id)));
}

async function getUserOrgIds(
  supabase: SupabaseClient,
  profileId: string,
): Promise<string[]> {
  const orgs = await getUserOrgs(supabase, profileId);
  return orgs.map((o) => o.id);
}

async function getFifoPackageId(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("prepaid_packages")
    .select("id, pickup_count, used_count, expires_at, status")
    .eq("organization_id", orgId)
    .eq("status", "approved")
    .gt("expires_at", new Date().toISOString());

  const pkg = data ? selectFifoPrepaidPackage(data) : null;
  return pkg?.id ?? null;
}

// --- Replies / prompts ---

function menuReply(name: string | null): WhatsAppHandlerReply {
  return {
    kind: "buttons",
    message: `Hi ${name?.split(" ")[0] || "there"}! What would you like to do?`,
    buttons: BWG_MENU_BUTTONS,
  };
}

/** Buttons/rows that only make sense while a conversation is in progress. */
function isStaleFlowPayload(payload: string): boolean {
  return (
    payload.startsWith("wa_org:") ||
    payload.startsWith("wa_slot:") ||
    payload.startsWith("wa_pk:")
  );
}

function sessionExpiredReply(name: string | null): WhatsAppHandlerReply {
  return {
    kind: "buttons",
    message: `Your previous session expired, ${
      name?.split(" ")[0] || "there"
    }, so I've started over. What would you like to do?`,
    buttons: BWG_MENU_BUTTONS,
  };
}

function orgPickerReply(orgs: OrgRef[]): WhatsAppHandlerReply {
  const message = "Which organization is this pickup for?";
  if (orgs.length <= 3) {
    return {
      kind: "buttons",
      message,
      buttons: orgs.map(
        (o): WhatsAppButton => ({
          id: `wa_org:${o.id}`,
          title: o.name.slice(0, 20),
        }),
      ),
    };
  }
  return {
    kind: "list",
    message,
    button: "Select",
    sections: [
      {
        rows: orgs.map((o) => ({ id: `wa_org:${o.id}`, title: o.name })),
      },
    ],
  };
}

function datePrompt(orgName: string): string {
  const minLabel = formatDateDDMMYYYY(minPickupDateISO());
  return [
    `Great — ${orgName}.`,
    "",
    "Please send the pickup date in DD/MM/YYYY format.",
    `The date must be on or after ${minLabel} (at least 2 days from today).`,
  ].join("\n");
}

// --- New pickup flow ---

async function startNewPickup(
  supabase: SupabaseClient,
  input: BwgIncoming,
): Promise<WhatsAppHandlerReply> {
  // Restarting mid-flow: discard any photos the previous attempt uploaded.
  await clearConversationWithPhotos(supabase, input.phone);

  const orgs = await getUserOrgs(supabase, input.profileId);
  if (orgs.length === 0) {
    await clearConversation(supabase, input.phone);
    return text(
      "No organization is linked to your account. Please contact GreensBrowns admin.",
    );
  }

  await setConversation(supabase, {
    phone: input.phone,
    profileId: input.profileId,
    flow: "new_pickup",
    step: "choose_org",
    data: { orgs },
  });

  return orgPickerReply(orgs);
}

async function handleNewPickupStep(
  supabase: SupabaseClient,
  input: BwgIncoming,
  convo: ConversationState,
): Promise<WhatsAppHandlerReply> {
  switch (convo.step) {
    case "choose_org":
      return stepChooseOrg(supabase, input, convo);
    case "await_date":
      return stepAwaitDate(supabase, input, convo);
    case "await_slot":
      return stepAwaitSlot(supabase, input, convo);
    case "await_photos":
      return stepAwaitPhotos(supabase, input, convo);
    case "await_notes":
      return stepAwaitNotes(supabase, input, convo);
    default:
      await clearConversation(supabase, input.phone);
      return menuReply(input.profileName);
  }
}

async function stepChooseOrg(
  supabase: SupabaseClient,
  input: BwgIncoming,
  convo: ConversationState,
): Promise<WhatsAppHandlerReply> {
  const orgs = (convo.data.orgs as OrgRef[]) ?? [];

  if (!input.buttonPayload.startsWith("wa_org:")) {
    return orgPickerReply(orgs);
  }
  const orgId = input.buttonPayload.slice("wa_org:".length);
  if (!orgs.some((o) => o.id === orgId)) {
    return orgPickerReply(orgs);
  }

  const { data: orgRow } = await supabase
    .from("organizations")
    .select("name, is_active")
    .eq("id", orgId)
    .single();

  if (!orgRow) {
    await clearConversation(supabase, input.phone);
    return text("That organization could not be found. Please contact admin.");
  }
  if (orgRow.is_active === false) {
    await clearConversation(supabase, input.phone);
    return text(
      `Your organization ${orgRow.name} is suspended and cannot schedule pickups. Please contact GreensBrowns support.`,
    );
  }

  const prepaidPackageId = await getFifoPackageId(supabase, orgId);
  if (!prepaidPackageId) {
    await clearConversation(supabase, input.phone);
    return text(
      "Your organization has no prepaid pickup credits. Please purchase a prepaid credit package on the GreensBrowns app first, then start a new pickup here.",
    );
  }

  await updateConversation(supabase, input.phone, {
    step: "await_date",
    data: { ...convo.data, orgId, orgName: orgRow.name, prepaidPackageId },
  });
  return text(datePrompt(orgRow.name));
}

async function stepAwaitDate(
  supabase: SupabaseClient,
  input: BwgIncoming,
  convo: ConversationState,
): Promise<WhatsAppHandlerReply> {
  if (input.mediaId) {
    return text("Please send the pickup date in DD/MM/YYYY format.");
  }

  const parsed = parseUserDate(input.text);
  if (!parsed) {
    const example = formatDateDDMMYYYY(minPickupDateISO());
    return text(
      `I couldn't read that date. Please send it as DD/MM/YYYY, for example ${example}.`,
    );
  }

  const minISO = minPickupDateISO();
  if (parsed < minISO) {
    return text(
      `The pickup date must be on or after ${formatDateDDMMYYYY(
        minISO,
      )} (at least 2 days from today). Please send another date.`,
    );
  }

  await updateConversation(supabase, input.phone, {
    step: "await_slot",
    data: { ...convo.data, scheduledDate: parsed },
  });

  return {
    kind: "buttons",
    message: `Pickup date set to ${formatDateDDMMYYYY(parsed)}.\n\nChoose a time slot:`,
    buttons: BWG_SLOT_BUTTONS,
  };
}

async function stepAwaitSlot(
  supabase: SupabaseClient,
  input: BwgIncoming,
  convo: ConversationState,
): Promise<WhatsAppHandlerReply> {
  let slot: string | null = null;
  if (input.buttonPayload.startsWith("wa_slot:")) {
    slot = input.buttonPayload.slice("wa_slot:".length);
  } else {
    const t = input.text.toLowerCase().trim();
    if ((SLOTS as readonly string[]).includes(t)) slot = t;
  }

  if (!slot || !(SLOTS as readonly string[]).includes(slot)) {
    return {
      kind: "buttons",
      message: "Please choose a time slot:",
      buttons: BWG_SLOT_BUTTONS,
    };
  }

  await updateConversation(supabase, input.phone, {
    step: "await_photos",
    data: { ...convo.data, scheduledSlot: slot as Slot, photoUrls: [] },
  });

  return text(
    `Slot set to ${slotTitle(slot)}.\n\nNow please send 2 photos of the waste. You can send them one at a time.`,
  );
}

async function stepAwaitPhotos(
  supabase: SupabaseClient,
  input: BwgIncoming,
  convo: ConversationState,
): Promise<WhatsAppHandlerReply> {
  const photoUrls = (convo.data.photoUrls as string[]) ?? [];

  if (!input.mediaId) {
    return text(
      `Please send a photo of the waste. ${photoUrls.length}/2 received so far.`,
    );
  }
  if (input.mediaType && !input.mediaType.startsWith("image/")) {
    return text(
      "That doesn't look like a photo. Please send an image of the waste.",
    );
  }

  const url = await storeWastePhoto(
    supabase,
    input.mediaId,
    convo.data.orgId as string,
    input.mediaType,
  );
  if (!url) {
    return text("Sorry, I couldn't save that photo. Please try sending it again.");
  }

  const updated = [...photoUrls, url];
  if (updated.length < 2) {
    await updateConversation(supabase, input.phone, {
      data: { ...convo.data, photoUrls: updated },
    });
    return text(
      `Photo ${updated.length} received. Please send ${2 - updated.length} more.`,
    );
  }

  await updateConversation(supabase, input.phone, {
    step: "await_notes",
    data: { ...convo.data, photoUrls: updated },
  });
  return text(
    "Got 2 photos. Finally, send any additional notes or special instructions for this pickup, or reply 'No' to skip.",
  );
}

async function stepAwaitNotes(
  supabase: SupabaseClient,
  input: BwgIncoming,
  convo: ConversationState,
): Promise<WhatsAppHandlerReply> {
  if (input.mediaId) {
    return text(
      "Please send any notes as a text message, or reply 'No' to skip.",
    );
  }

  // Idempotency lock: only the webhook delivery that wins this atomic step
  // transition proceeds to create the pickup. Duplicate/echoed deliveries stop.
  const claimed = await claimConversationStep(
    supabase,
    input.phone,
    "await_notes",
    "creating",
  );
  if (!claimed) return { kind: "none" };

  const raw = input.text.trim();
  const skip = ["no", "none", "skip", "n", "-"].includes(raw.toLowerCase());
  const notes = skip || !raw ? null : raw;

  const orgId = convo.data.orgId as string;
  const scheduledDate = convo.data.scheduledDate as string;
  const scheduledSlot = convo.data.scheduledSlot as string;

  // Re-validate the date at creation time — it may have crossed the 2-day
  // minimum while the conversation sat idle (e.g. across IST midnight).
  if (!scheduledDate || scheduledDate < minPickupDateISO()) {
    await clearConversationWithPhotos(supabase, input.phone);
    return text(
      `This pickup date is no longer valid — it must be on or after ${formatDateDDMMYYYY(
        minPickupDateISO(),
      )} (at least 2 days from today). Please send 'hi' to start a new pickup.`,
    );
  }

  // Re-select the FIFO prepaid package now instead of trusting the id pinned at
  // org-confirm; it may have expired or been consumed by another booking.
  const prepaidPackageId = await getFifoPackageId(supabase, orgId);
  if (!prepaidPackageId) {
    await clearConversationWithPhotos(supabase, input.phone);
    return text(
      "Your organization has no prepaid pickup credits. Please purchase a prepaid credit package on the GreensBrowns app first, then start a new pickup here.",
    );
  }

  const result = await createWhatsAppPickup(supabase, {
    orgId,
    requestedBy: input.profileId,
    scheduledDate,
    scheduledSlot,
    notes,
    photoUrls: (convo.data.photoUrls as string[]) ?? [],
    prepaidPackageId,
  });

  if (!result.ok) {
    await clearConversationWithPhotos(supabase, input.phone);
    return text(result.message);
  }

  if (result.deduped) {
    // A matching pickup already exists (e.g. created on the app moments ago);
    // discard this attempt's photos and don't double-book or double-charge.
    await clearConversationWithPhotos(supabase, input.phone);
    return text(
      `You already have a pickup request for this date and slot (${
        result.pickupNumber ?? "existing"
      }). I won't create a duplicate.`,
    );
  }

  // Success: photos now belong to the pickup, so clear without purging them.
  await clearConversation(supabase, input.phone);

  // The confirmation is the approved bwg_pickup_requested template (Cancel button).
  await sendBwgPickupRequestedWhatsApp(result.pickupId);
  return { kind: "none" };
}

interface CreatePickupArgs {
  orgId: string;
  requestedBy: string;
  scheduledDate: string;
  scheduledSlot: string;
  notes: string | null;
  photoUrls: string[];
  prepaidPackageId: string;
}

type CreatePickupResult =
  | { ok: true; pickupId: string; pickupNumber?: string | null; deduped?: boolean }
  | { ok: false; message: string };

/** Window within which an identical pickup is treated as the same request. */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

async function createWhatsAppPickup(
  supabase: SupabaseClient,
  args: CreatePickupArgs,
): Promise<CreatePickupResult> {
  // Idempotency across channels: if an equivalent active pickup was just created
  // (e.g. on the web app or an echoed WhatsApp message), reuse it instead of
  // creating a duplicate and consuming a second credit.
  const sinceIso = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const inactiveList = `(${INACTIVE_STATUSES.map((s) => `"${s}"`).join(",")})`;
  const { data: existing } = await supabase
    .from("pickups")
    .select("id, pickup_number")
    .eq("organization_id", args.orgId)
    .eq("scheduled_date", args.scheduledDate)
    .eq("scheduled_slot", args.scheduledSlot)
    .not("status", "in", inactiveList)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      ok: true,
      pickupId: existing.id,
      pickupNumber: existing.pickup_number,
      deduped: true,
    };
  }

  const { data, error } = await supabase
    .from("pickups")
    .insert({
      organization_id: args.orgId,
      requested_by: args.requestedBy,
      status: "requested",
      scheduled_date: args.scheduledDate,
      scheduled_slot: args.scheduledSlot,
      notes: args.notes,
      loading_helper_required: false,
      waste_photo_urls: args.photoUrls,
      prepaid_package_id: args.prepaidPackageId,
    })
    .select("id")
    .single();

  if (error || !data) {
    const msg = error?.message ?? "";
    if (msg.includes("Insufficient prepaid credits")) {
      return {
        ok: false,
        message:
          "Your organization has no prepaid pickup credits. Please purchase a prepaid credit package on the GreensBrowns app first, then start a new pickup here.",
      };
    }
    if (msg.includes("suspended")) {
      return {
        ok: false,
        message:
          "Your organization is suspended and cannot schedule pickups. Please contact GreensBrowns support.",
      };
    }
    console.error("[WhatsApp] pickup insert failed", error);
    return {
      ok: false,
      message:
        "Sorry, I couldn't create the pickup. Please try again or use the GreensBrowns app.",
    };
  }

  await supabase.from("pickup_events").insert({
    pickup_id: data.id,
    status: "requested",
    changed_by: args.requestedBy,
    notes: "Pickup scheduled via WhatsApp",
  });

  return { ok: true, pickupId: data.id, deduped: false };
}

// --- Pickup status flow ---

async function startPickupStatus(
  supabase: SupabaseClient,
  input: BwgIncoming,
): Promise<WhatsAppHandlerReply> {
  const orgIds = await getUserOrgIds(supabase, input.profileId);
  if (orgIds.length === 0) {
    await clearConversation(supabase, input.phone);
    return text(
      "No organization is linked to your account. Please contact GreensBrowns admin.",
    );
  }

  const inactiveList = `(${INACTIVE_STATUSES.map((s) => `"${s}"`).join(",")})`;
  const { data: pickups } = await supabase
    .from("pickups")
    .select("id, pickup_number, scheduled_date, scheduled_slot, status")
    .in("organization_id", orgIds)
    .not("status", "in", inactiveList)
    .order("scheduled_date", { ascending: true })
    .limit(10);

  if (!pickups || pickups.length === 0) {
    await clearConversation(supabase, input.phone);
    return text("You have no active pickups.");
  }

  await setConversation(supabase, {
    phone: input.phone,
    profileId: input.profileId,
    flow: "pickup_status",
    step: "choose_pickup",
    data: {},
  });

  return {
    kind: "list",
    message: "Here are your active pickups. Select one to see details:",
    button: "View",
    sections: [
      {
        rows: pickups.map((p) => ({
          id: `wa_pk:${p.id}`,
          title: p.pickup_number ?? p.id,
          description: `${formatDateDDMMYYYY(p.scheduled_date)} · ${slotTitle(
            p.scheduled_slot,
          )} · ${pickupStatusLabel(p.status)}`,
        })),
      },
    ],
  };
}

async function handlePickupStatusStep(
  supabase: SupabaseClient,
  input: BwgIncoming,
): Promise<WhatsAppHandlerReply> {
  const orgIds = await getUserOrgIds(supabase, input.profileId);
  if (orgIds.length === 0) {
    await clearConversation(supabase, input.phone);
    return text("No organization is linked to your account.");
  }

  let queryBuilder = supabase
    .from("pickups")
    .select(
      "id, pickup_number, scheduled_date, scheduled_slot, status, vehicles(registration_number)",
    )
    .in("organization_id", orgIds);

  if (input.buttonPayload.startsWith("wa_pk:")) {
    queryBuilder = queryBuilder.eq("id", input.buttonPayload.slice("wa_pk:".length));
  } else {
    const typed = input.text.trim();
    if (!typed) {
      return text(
        "Please tap a pickup from the list, or send the pickup number.",
      );
    }
    queryBuilder = queryBuilder.ilike("pickup_number", typed);
  }

  const { data } = await queryBuilder.limit(1).maybeSingle();

  if (!data) {
    return text(
      "I couldn't find that pickup. Please tap a pickup from the list, or send 'hi' to start over.",
    );
  }

  await clearConversation(supabase, input.phone);

  const vehicle = data.vehicles as unknown as {
    registration_number: string;
  } | null;

  return text(
    [
      `Pickup ${data.pickup_number ?? data.id}`,
      `Date: ${formatDateDDMMYYYY(data.scheduled_date)}`,
      `Slot: ${slotTitle(data.scheduled_slot)}`,
      `Status: ${pickupStatusLabel(data.status)}`,
      `Vehicle: ${vehicle?.registration_number ?? "Not assigned yet"}`,
    ].join("\n"),
  );
}

// --- Cancel pickup (Cancel button on bwg_pickup_requested template) ---

async function handleBwgCancelRequest(
  supabase: SupabaseClient,
  profileId: string,
): Promise<WhatsAppHandlerReply> {
  const orgIds = await getUserOrgIds(supabase, profileId);
  if (orgIds.length === 0) {
    return text("No organization linked to your account.");
  }

  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, pickup_number, status")
    .in("organization_id", orgIds)
    .eq("status", "requested")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pickup) {
    return text("No pickup request found that can be cancelled.");
  }

  const { error } = await supabase
    .from("pickups")
    .update({ status: "cancelled" })
    .eq("id", pickup.id)
    .eq("status", "requested");

  if (error) {
    console.error("[WhatsApp] BWG cancel pickup failed", {
      pickupId: pickup.id,
      error,
    });
    return text("Failed to cancel pickup. Please try again or use the app.");
  }

  await supabase.from("pickup_events").insert({
    pickup_id: pickup.id,
    status: "cancelled",
    changed_by: profileId,
    notes: "Cancelled via WhatsApp",
  });

  await sendBwgPickupCancelledWhatsApp(pickup.id);

  return text(`Pickup ${pickup.pickup_number ?? pickup.id} has been cancelled.`);
}

// --- Entry point ---

export async function handleBwgMessage(
  input: BwgIncoming,
): Promise<WhatsAppHandlerReply> {
  const supabase = createAdminClient();
  const choiceRaw = input.buttonPayload || input.text;
  const lower = choiceRaw.toLowerCase().trim();

  // Cancel button on the pickup-requested template (or typed "cancel").
  if (normalizeBwgWhatsAppChoice(choiceRaw) === "cancel_pickup") {
    await clearConversationWithPhotos(supabase, input.phone);
    return handleBwgCancelRequest(supabase, input.profileId);
  }

  // Greeting always returns to the menu (discard any abandoned-flow photos).
  if (GREETINGS.has(lower)) {
    await clearConversationWithPhotos(supabase, input.phone);
    return menuReply(input.profileName);
  }

  // Menu buttons can be tapped at any time to (re)start a flow.
  if (input.buttonPayload === "wa_new_pickup") {
    return startNewPickup(supabase, input);
  }
  if (input.buttonPayload === "wa_pickup_status") {
    return startPickupStatus(supabase, input);
  }

  // Continue an in-progress conversation.
  const convo = await getConversation(supabase, input.phone);
  if (convo?.flow === "new_pickup") {
    return handleNewPickupStep(supabase, input, convo);
  }
  if (convo?.flow === "pickup_status") {
    return handlePickupStatusStep(supabase, input);
  }

  // A flow-step button was tapped but the session already expired/cleared.
  // Tell the user and force a clean restart rather than silently showing a menu.
  if (isStaleFlowPayload(input.buttonPayload)) {
    return sessionExpiredReply(input.profileName);
  }

  // Nothing in progress — show the menu.
  return menuReply(input.profileName);
}
