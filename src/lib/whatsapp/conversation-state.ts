import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Persisted state for a multi-step WhatsApp conversation (one row per phone).
 * Stored in `whatsapp_conversations`; accessed with the service-role client.
 */
export interface ConversationState {
  phone: string;
  profileId: string | null;
  flow: string;
  step: string;
  data: Record<string, unknown>;
}

/** Conversations abandoned for longer than this are treated as fresh starts. */
const CONVERSATION_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Bucket where in-progress waste photos are uploaded during the pickup flow. */
const PICKUP_PHOTO_BUCKET = "pickup-photos";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function expiryFromNow(): string {
  return new Date(Date.now() + CONVERSATION_TTL_MS).toISOString();
}

/** Convert a public storage URL back to its in-bucket object path. */
function publicUrlToStoragePath(url: string): string | null {
  const marker = `/storage/v1/object/public/${PICKUP_PHOTO_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = url.slice(idx + marker.length).split("?")[0];
  return path ? decodeURIComponent(path) : null;
}

/** Best-effort delete of waste photos that were uploaded but never attached. */
async function purgePhotos(
  supabase: SupabaseClient,
  data: Record<string, unknown> | null | undefined,
): Promise<number> {
  const urls = Array.isArray(data?.photoUrls)
    ? (data!.photoUrls as unknown[]).filter(
        (u): u is string => typeof u === "string",
      )
    : [];
  if (urls.length === 0) return 0;

  const paths = urls
    .map(publicUrlToStoragePath)
    .filter((p): p is string => !!p);
  if (paths.length === 0) return 0;

  const { error } = await supabase.storage
    .from(PICKUP_PHOTO_BUCKET)
    .remove(paths);
  if (error) {
    console.error("[WhatsApp] orphan photo cleanup failed", error);
    return 0;
  }
  return paths.length;
}

/** Returns the active (non-expired) conversation for a phone, or null. */
export async function getConversation(
  supabase: SupabaseClient,
  phone: string,
): Promise<ConversationState | null> {
  const key = normalizePhone(phone);
  const { data } = await supabase
    .from("whatsapp_conversations")
    .select("phone, profile_id, flow, step, data, expires_at")
    .eq("phone", key)
    .maybeSingle();

  if (!data) return null;

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    // Abandoned flow: drop any photos uploaded but never attached to a pickup.
    await purgePhotos(supabase, data.data as Record<string, unknown>);
    await clearConversation(supabase, key);
    return null;
  }

  return {
    phone: data.phone,
    profileId: data.profile_id,
    flow: data.flow,
    step: data.step,
    data: (data.data as Record<string, unknown>) ?? {},
  };
}

/** Creates or replaces the conversation for a phone, refreshing its TTL. */
export async function setConversation(
  supabase: SupabaseClient,
  state: ConversationState,
): Promise<void> {
  const key = normalizePhone(state.phone);
  const { error } = await supabase.from("whatsapp_conversations").upsert(
    {
      phone: key,
      profile_id: state.profileId,
      flow: state.flow,
      step: state.step,
      data: state.data,
      expires_at: expiryFromNow(),
    },
    { onConflict: "phone" },
  );

  if (error) {
    console.error("[WhatsApp] conversation upsert failed", { phone: key, error });
  }
}

/** Advances the current conversation to a new step and/or merges data. */
export async function updateConversation(
  supabase: SupabaseClient,
  phone: string,
  patch: { step?: string; data?: Record<string, unknown> },
): Promise<void> {
  const key = normalizePhone(phone);
  const update: Record<string, unknown> = { expires_at: expiryFromNow() };
  if (patch.step !== undefined) update.step = patch.step;
  if (patch.data !== undefined) update.data = patch.data;

  const { error } = await supabase
    .from("whatsapp_conversations")
    .update(update)
    .eq("phone", key);

  if (error) {
    console.error("[WhatsApp] conversation update failed", { phone: key, error });
  }
}

/** Removes the conversation (flow complete; photos already owned by a pickup). */
export async function clearConversation(
  supabase: SupabaseClient,
  phone: string,
): Promise<void> {
  const key = normalizePhone(phone);
  await supabase.from("whatsapp_conversations").delete().eq("phone", key);
}

/**
 * Removes the conversation AND purges any uploaded-but-unattached waste photos.
 * Use when aborting/restarting a flow (the photos will never reach a pickup).
 */
export async function clearConversationWithPhotos(
  supabase: SupabaseClient,
  phone: string,
): Promise<void> {
  const key = normalizePhone(phone);
  const { data } = await supabase
    .from("whatsapp_conversations")
    .select("data")
    .eq("phone", key)
    .maybeSingle();

  if (data) {
    await purgePhotos(supabase, data.data as Record<string, unknown>);
  }
  await supabase.from("whatsapp_conversations").delete().eq("phone", key);
}

/**
 * Atomically advance a conversation from one step to another. Returns true only
 * for the caller that won the transition — used as an idempotency lock so two
 * near-simultaneous webhook deliveries can't both create a pickup.
 */
export async function claimConversationStep(
  supabase: SupabaseClient,
  phone: string,
  fromStep: string,
  toStep: string,
): Promise<boolean> {
  const key = normalizePhone(phone);
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .update({ step: toStep, expires_at: expiryFromNow() })
    .eq("phone", key)
    .eq("step", fromStep)
    .select("phone");

  if (error) {
    console.error("[WhatsApp] conversation claim failed", { phone: key, error });
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Periodic cleanup (weekly cron): delete expired conversations and purge any
 * orphaned waste photos they were holding. Returns counts for logging.
 */
export async function cleanupExpiredConversations(
  supabase: SupabaseClient,
): Promise<{ conversations: number; photos: number }> {
  const nowIso = new Date().toISOString();
  const { data: rows } = await supabase
    .from("whatsapp_conversations")
    .select("phone, data")
    .lt("expires_at", nowIso);

  let photos = 0;
  for (const row of rows ?? []) {
    photos += await purgePhotos(supabase, row.data as Record<string, unknown>);
  }

  await supabase
    .from("whatsapp_conversations")
    .delete()
    .lt("expires_at", nowIso);

  return { conversations: rows?.length ?? 0, photos };
}
