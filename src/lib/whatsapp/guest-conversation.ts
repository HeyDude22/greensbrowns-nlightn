import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateDDMMYYYY } from "@/lib/utils";
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
  SLOTS,
  type Slot,
  slotTitle,
  minPickupDateISO,
  parseUserDate,
  storeWastePhoto,
  isValidGstin,
} from "./flow-helpers";
import { BWG_SLOT_BUTTONS, type WhatsAppHandlerReply } from "./types";
import { createGuestPickup } from "./guest-pickup";
import { sendBwgPickupCancelledWhatsApp } from "./notifications";

const SYSTEM_GUEST_PROFILE_ID = process.env.SYSTEM_GUEST_PROFILE_ID ?? "";

/** Normalized inbound message handed to the guest one-off conversation engine. */
export interface GuestIncoming {
  phone: string;
  text: string;
  buttonPayload: string;
  mediaId: string;
  mediaType: string;
  latitude?: number;
  longitude?: number;
}

const FLOW = "guest_one_off";
const PHOTO_PREFIX = "guest";
const MIN_PHOTOS = 2;

/** Photos uploaded for guests live under this prefix in the pickup bucket. */
const SKIP_GST = new Set(["no", "none", "skip", "n", "-"]);

const GUEST_GREETINGS = new Set([
  "hi",
  "hii",
  "hello",
  "helo",
  "hey",
  "pickup",
  "new pickup",
  "new",
  "start",
  "menu",
]);

const REUSE_BTN = "guest_reuse";
const FRESH_BTN = "guest_fresh";

interface SavedGuest {
  requesterName: string;
  orgName: string;
  address: string;
  gstin: string | null;
  lat: number;
  lng: number;
}

function text(message: string): WhatsAppHandlerReply {
  return { kind: "text", message };
}

function namePrompt(): WhatsAppHandlerReply {
  return text(
    "Hi! I can arrange a one-off waste pickup for you. First, what's your name?",
  );
}

function datePrompt(): WhatsAppHandlerReply {
  const minLabel = formatDateDDMMYYYY(minPickupDateISO());
  return text(
    [
      "Please send the pickup date in DD/MM/YYYY format.",
      `The date must be on or after ${minLabel} (at least 2 days from today).`,
    ].join("\n"),
  );
}

function locationPrompt(): WhatsAppHandlerReply {
  return text(
    "Please share the pickup location using WhatsApp's location button (tap the attachment/clip icon, then Location).",
  );
}

function gstPrompt(): WhatsAppHandlerReply {
  return text(
    "Do you have a GST number for this pickup? Send your 15-character GSTIN, or reply 'No' to skip.",
  );
}

// --- Flow start (with returning-guest fast path) ---

async function startGuestFlow(
  supabase: SupabaseClient,
  input: GuestIncoming,
): Promise<WhatsAppHandlerReply> {
  await clearConversationWithPhotos(supabase, input.phone);

  const saved = await loadSavedGuest(supabase, input.phone);
  if (saved) {
    await setConversation(supabase, {
      phone: input.phone,
      profileId: null,
      flow: FLOW,
      step: "confirm_returning",
      data: { saved },
    });
    return {
      kind: "buttons",
      message: `Welcome back, ${saved.requesterName.split(" ")[0]}! Should I reuse your saved details (${saved.orgName})?`,
      buttons: [
        { id: REUSE_BTN, title: "Use saved details" },
        { id: FRESH_BTN, title: "Start fresh" },
      ],
    };
  }

  await setConversation(supabase, {
    phone: input.phone,
    profileId: null,
    flow: FLOW,
    step: "await_name",
    data: {},
  });
  return namePrompt();
}

async function loadSavedGuest(
  supabase: SupabaseClient,
  phone: string,
): Promise<SavedGuest | null> {
  const normalizedPhone = phone.replace(/\D/g, "");
  const { data } = await supabase
    .from("guest_requests")
    .select("requester_name, org_name, address, gstin, lat, lng")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (
    !data ||
    !data.requester_name ||
    !data.org_name ||
    !data.address ||
    data.lat == null ||
    data.lng == null
  ) {
    return null;
  }

  return {
    requesterName: data.requester_name,
    orgName: data.org_name,
    address: data.address,
    gstin: data.gstin ?? null,
    lat: data.lat,
    lng: data.lng,
  };
}

// --- Step router ---

async function handleGuestStep(
  supabase: SupabaseClient,
  input: GuestIncoming,
  convo: ConversationState,
): Promise<WhatsAppHandlerReply> {
  switch (convo.step) {
    case "confirm_returning":
      return stepConfirmReturning(supabase, input, convo);
    case "await_name":
      return stepAwaitName(supabase, input, convo);
    case "await_org":
      return stepAwaitOrg(supabase, input, convo);
    case "await_address":
      return stepAwaitAddress(supabase, input, convo);
    case "await_location":
      return stepAwaitLocation(supabase, input, convo);
    case "await_gst":
      return stepAwaitGst(supabase, input, convo);
    case "await_date":
      return stepAwaitDate(supabase, input, convo);
    case "await_slot":
      return stepAwaitSlot(supabase, input, convo);
    case "await_photos":
      return stepAwaitPhotos(supabase, input, convo);
    default:
      return startGuestFlow(supabase, input);
  }
}

async function stepConfirmReturning(
  supabase: SupabaseClient,
  input: GuestIncoming,
  convo: ConversationState,
): Promise<WhatsAppHandlerReply> {
  const saved = convo.data.saved as SavedGuest | undefined;

  if (input.buttonPayload === FRESH_BTN || !saved) {
    await updateConversation(supabase, input.phone, {
      step: "await_name",
      data: {},
    });
    return namePrompt();
  }

  if (input.buttonPayload === REUSE_BTN) {
    await updateConversation(supabase, input.phone, {
      step: "await_date",
      data: {
        requesterName: saved.requesterName,
        orgName: saved.orgName,
        address: saved.address,
        gstin: saved.gstin,
        lat: saved.lat,
        lng: saved.lng,
      },
    });
    return datePrompt();
  }

  return {
    kind: "buttons",
    message: "Would you like to reuse your saved details?",
    buttons: [
      { id: REUSE_BTN, title: "Use saved details" },
      { id: FRESH_BTN, title: "Start fresh" },
    ],
  };
}

async function stepAwaitName(
  supabase: SupabaseClient,
  input: GuestIncoming,
  convo: ConversationState,
): Promise<WhatsAppHandlerReply> {
  const name = input.text.trim();
  if (input.mediaId || name.length < 2) {
    return text("Please send your name as a text message.");
  }
  await updateConversation(supabase, input.phone, {
    step: "await_org",
    data: { ...convo.data, requesterName: name },
  });
  return text(
    "Thanks! What's the name of your organization, building, or society?",
  );
}

async function stepAwaitOrg(
  supabase: SupabaseClient,
  input: GuestIncoming,
  convo: ConversationState,
): Promise<WhatsAppHandlerReply> {
  const orgName = input.text.trim();
  if (input.mediaId || orgName.length < 2) {
    return text("Please send the organization/building name as text.");
  }
  await updateConversation(supabase, input.phone, {
    step: "await_address",
    data: { ...convo.data, orgName },
  });
  return text("Got it. What's the full pickup address?");
}

async function stepAwaitAddress(
  supabase: SupabaseClient,
  input: GuestIncoming,
  convo: ConversationState,
): Promise<WhatsAppHandlerReply> {
  const address = input.text.trim();
  if (input.mediaId || address.length < 5) {
    return text("Please send the full pickup address as text.");
  }
  await updateConversation(supabase, input.phone, {
    step: "await_location",
    data: { ...convo.data, address },
  });
  return locationPrompt();
}

async function stepAwaitLocation(
  supabase: SupabaseClient,
  input: GuestIncoming,
  convo: ConversationState,
): Promise<WhatsAppHandlerReply> {
  if (input.latitude == null || input.longitude == null) {
    return locationPrompt();
  }
  await updateConversation(supabase, input.phone, {
    step: "await_gst",
    data: { ...convo.data, lat: input.latitude, lng: input.longitude },
  });
  return gstPrompt();
}

async function stepAwaitGst(
  supabase: SupabaseClient,
  input: GuestIncoming,
  convo: ConversationState,
): Promise<WhatsAppHandlerReply> {
  if (input.mediaId) {
    return text("Please send your GSTIN as text, or reply 'No' to skip.");
  }
  const raw = input.text.trim();
  const lower = raw.toLowerCase();

  let gstin: string | null;
  if (SKIP_GST.has(lower)) {
    gstin = null;
  } else if (isValidGstin(raw)) {
    gstin = raw.toUpperCase();
  } else {
    return text(
      "That doesn't look like a valid 15-character GSTIN. Please re-send it, or reply 'No' to skip.",
    );
  }

  await updateConversation(supabase, input.phone, {
    step: "await_date",
    data: { ...convo.data, gstin },
  });
  return datePrompt();
}

async function stepAwaitDate(
  supabase: SupabaseClient,
  input: GuestIncoming,
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
  input: GuestIncoming,
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
    `Slot set to ${slotTitle(slot)}.\n\nFinally, please send ${MIN_PHOTOS} photos of the waste. You can send them one at a time.`,
  );
}

async function stepAwaitPhotos(
  supabase: SupabaseClient,
  input: GuestIncoming,
  convo: ConversationState,
): Promise<WhatsAppHandlerReply> {
  const photoUrls = (convo.data.photoUrls as string[]) ?? [];

  if (!input.mediaId) {
    return text(
      `Please send a photo of the waste. ${photoUrls.length}/${MIN_PHOTOS} received so far.`,
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
    PHOTO_PREFIX,
    input.mediaType,
  );
  if (!url) {
    return text("Sorry, I couldn't save that photo. Please try sending it again.");
  }

  const updated = [...photoUrls, url];
  // Persist photos first so the count is durable before we attempt to commit.
  await updateConversation(supabase, input.phone, {
    data: { ...convo.data, photoUrls: updated },
  });
  if (updated.length < MIN_PHOTOS) {
    return text(
      `Photo ${updated.length} received. Please send ${
        MIN_PHOTOS - updated.length
      } more.`,
    );
  }

  // Idempotency lock: only the delivery that wins this transition commits.
  const claimed = await claimConversationStep(
    supabase,
    input.phone,
    "await_photos",
    "creating",
  );
  if (!claimed) return { kind: "none" };

  const scheduledDate = convo.data.scheduledDate as string;
  if (!scheduledDate || scheduledDate < minPickupDateISO()) {
    await clearConversationWithPhotos(supabase, input.phone);
    return text(
      `This pickup date is no longer valid — it must be on or after ${formatDateDDMMYYYY(
        minPickupDateISO(),
      )} (at least 2 days from today). Please send 'pickup' to start again.`,
    );
  }

  const result = await createGuestPickup(supabase, {
    phone: input.phone,
    requesterName: convo.data.requesterName as string,
    orgName: convo.data.orgName as string,
    address: convo.data.address as string,
    gstin: (convo.data.gstin as string | null) ?? null,
    lat: convo.data.lat as number,
    lng: convo.data.lng as number,
    scheduledDate,
    scheduledSlot: convo.data.scheduledSlot as string,
    notes: null,
    photoUrls: updated,
  });

  if (!result.ok) {
    await clearConversationWithPhotos(supabase, input.phone);
    return text(result.message);
  }

  if (result.deduped) {
    await clearConversationWithPhotos(supabase, input.phone);
    return text(
      `You already have a pickup request for this date and slot (${
        result.pickupNumber ?? "existing"
      }). I won't create a duplicate.`,
    );
  }

  // Success: photos now belong to the pickup. The confirmation template
  // (bwg_pickup_requested) was already sent by createGuestPickup.
  await clearConversation(supabase, input.phone);
  return { kind: "none" };
}

// --- Cancel (Cancel button on the bwg_pickup_requested template) ---

/**
 * A guest can cancel their one-off request only while it is still `requested`
 * (i.e. before an admin verifies it). After verification, cancellation over
 * WhatsApp is no longer allowed and the guest is told to contact support.
 */
export async function handleGuestCancel(
  phone: string,
): Promise<WhatsAppHandlerReply> {
  const supabase = createAdminClient();
  const normalizedPhone = phone.replace(/\D/g, "");

  const { data: guest } = await supabase
    .from("guest_requests")
    .select("id")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (!guest) {
    return text("No one-off pickup request was found for this number.");
  }

  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, pickup_number, status")
    .eq("is_one_off", true)
    .eq("guest_request_id", guest.id)
    .eq("status", "requested")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pickup) {
    return text(
      "This pickup can no longer be cancelled here — it has already been processed by our team. Please contact GreensBrowns support for any changes.",
    );
  }

  // Guarded update: only cancels if still 'requested', so an admin verification
  // that lands at the same moment wins and the cancel becomes a no-op.
  const { data: cancelled, error } = await supabase
    .from("pickups")
    .update({ status: "cancelled" })
    .eq("id", pickup.id)
    .eq("status", "requested")
    .select("id");

  if (error || !cancelled || cancelled.length === 0) {
    if (error) {
      console.error("[WhatsApp] guest cancel failed", { pickupId: pickup.id, error });
      return text("Sorry, I couldn't cancel the pickup. Please try again.");
    }
    return text(
      "This pickup can no longer be cancelled here — it has already been processed by our team. Please contact GreensBrowns support for any changes.",
    );
  }

  await supabase
    .from("payments")
    .update({ status: "cancelled" })
    .eq("pickup_id", pickup.id);

  await supabase.from("pickup_events").insert({
    pickup_id: pickup.id,
    status: "cancelled",
    changed_by: SYSTEM_GUEST_PROFILE_ID || null,
    notes: "One-off pickup cancelled by guest via WhatsApp",
  });

  // Confirmation is the approved bwg_pickup_cancelled template.
  await sendBwgPickupCancelledWhatsApp(pickup.id);
  return { kind: "none" };
}

// --- Entry point ---

export async function handleGuestMessage(
  input: GuestIncoming,
): Promise<WhatsAppHandlerReply> {
  const supabase = createAdminClient();
  const lower = (input.buttonPayload || input.text).toLowerCase().trim();

  const convo = await getConversation(supabase, input.phone);

  // A greeting/opt-in keyword (re)starts the flow from scratch.
  if (GUEST_GREETINGS.has(lower)) {
    return startGuestFlow(supabase, input);
  }

  if (convo?.flow === FLOW) {
    return handleGuestStep(supabase, input, convo);
  }

  // Reached here via an opt-in keyword with no active conversation.
  return startGuestFlow(supabase, input);
}
