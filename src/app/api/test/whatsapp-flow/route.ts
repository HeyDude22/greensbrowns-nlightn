import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * End-to-end test for WhatsApp + Email notification flows.
 * Simulates webhook calls and verifies DB state at each step.
 *
 * GET /api/test/whatsapp-flow?step=seed|job-assigned|picked-up-prompt|picked-up-photo|delivered-prompt|delivered-photo|farmer-received|farmer-rejected|auto-accept|cleanup
 *
 * Run steps in order, or use step=all to run the full happy path.
 */

const TEST_COLLECTOR_PHONE = "9199999900001";
const TEST_FARMER_PHONE = "9199999900002";
const TEST_BWG_EMAIL = "test-bwg@a-gain.in";

const supabase = createAdminClient();

/**
 * Build a Meta Cloud API webhook payload and POST it to our webhook route.
 * Returns { ok, status } from the JSON response.
 */
async function simulateTextWebhook(
  baseUrl: string,
  from: string,
  body: string
) {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from,
                  type: "text",
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  return postWebhook(baseUrl, payload);
}

async function simulateButtonWebhook(
  baseUrl: string,
  from: string,
  buttonId: string,
  buttonTitle: string
) {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from,
                  type: "interactive",
                  interactive: {
                    type: "button_reply",
                    button_reply: { id: buttonId, title: buttonTitle },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  return postWebhook(baseUrl, payload);
}

async function simulateImageWebhook(
  baseUrl: string,
  from: string,
  mediaId = "test_media_id"
) {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from,
                  type: "image",
                  image: { id: mediaId, mime_type: "image/jpeg" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  return postWebhook(baseUrl, payload);
}

async function postWebhook(baseUrl: string, payload: unknown) {
  const res = await fetch(`${baseUrl}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.CRON_SECRET || "",
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  return { ok: json.ok === true, status: res.status, body: json };
}

async function getPickupStatus(pickupId: string) {
  const { data } = await supabase
    .from("pickups")
    .select("status, delivered_at, farmer_responded_at, rejection_reason, photo_before_url, photo_after_url")
    .eq("id", pickupId)
    .single();
  return data;
}

async function getPickupEvents(pickupId: string) {
  const { data } = await supabase
    .from("pickup_events")
    .select("status, notes, created_at")
    .eq("pickup_id", pickupId)
    .order("created_at", { ascending: true });
  return data || [];
}

// Test IDs stored across steps
let testIds: {
  orgId?: string;
  collectorProfileId?: string;
  farmerProfileId?: string;
  bwgProfileId?: string;
  vehicleId?: string;
  driverId?: string;
  pickupId?: string;
} = {};

async function seed() {
  const results: string[] = [];

  // 1. Create test org
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .insert({
      name: "Test Apartment (WhatsApp E2E)",
      address: "100 Test Street, Koramangala",
      city: "Bengaluru",
      org_type: "apartment",
      lat: 12.9352,
      lng: 77.6245,
    })
    .select("id")
    .single();

  if (orgErr) return { error: `Org: ${orgErr.message}` };
  testIds.orgId = org.id;
  results.push(`Org created: ${org.id}`);

  // 2. Create collector auth user + profile
  const { data: collectorAuth, error: collAuthErr } = await supabase.auth.admin.createUser({
    email: "test-collector@test.com",
    password: "test-password-123",
    email_confirm: true,
  });
  if (collAuthErr) return { error: `Collector auth: ${collAuthErr.message}` };
  const collectorId = collectorAuth.user.id;

  const { error: collErr } = await supabase.from("profiles").upsert({
    id: collectorId,
    email: "test-collector@test.com",
    full_name: "Test Collector",
    phone: TEST_COLLECTOR_PHONE,
    role: "collector",
    city: "Bengaluru",
  });
  if (collErr) return { error: `Collector profile: ${collErr.message}` };
  testIds.collectorProfileId = collectorId;
  results.push(`Collector profile: ${collectorId}`);

  // 3. Create farmer auth user + profile + details
  const { data: farmerAuth, error: farmerAuthErr } = await supabase.auth.admin.createUser({
    email: "test-farmer@test.com",
    password: "test-password-123",
    email_confirm: true,
  });
  if (farmerAuthErr) return { error: `Farmer auth: ${farmerAuthErr.message}` };
  const farmerId = farmerAuth.user.id;

  const { error: farmerErr } = await supabase.from("profiles").upsert({
    id: farmerId,
    email: "test-farmer@test.com",
    full_name: "Test Farmer",
    phone: TEST_FARMER_PHONE,
    role: "farmer",
    city: "Bengaluru",
  });
  if (farmerErr) return { error: `Farmer profile: ${farmerErr.message}` };

  const { error: fdErr } = await supabase.from("farmer_details").insert({
    profile_id: farmerId,
    farm_name: "Test Farm",
    farm_address: "Test Farm Road, Anekal",
    farm_lat: 12.7105,
    farm_lng: 77.6969,
  });
  if (fdErr) return { error: `Farmer details: ${fdErr.message}` };
  testIds.farmerProfileId = farmerId;
  results.push(`Farmer profile: ${farmerId}`);

  // 4. Create BWG auth user + profile
  const { data: bwgAuth, error: bwgAuthErr } = await supabase.auth.admin.createUser({
    email: TEST_BWG_EMAIL,
    password: "test-password-123",
    email_confirm: true,
  });
  if (bwgAuthErr) return { error: `BWG auth: ${bwgAuthErr.message}` };
  const bwgId = bwgAuth.user.id;

  const { error: bwgErr } = await supabase.from("profiles").upsert({
    id: bwgId,
    email: TEST_BWG_EMAIL,
    full_name: "Test BWG User",
    phone: "9199999900003",
    role: "bwg",
    city: "Bengaluru",
  });
  if (bwgErr) return { error: `BWG profile: ${bwgErr.message}` };
  testIds.bwgProfileId = bwgId;
  results.push(`BWG profile: ${bwgId}`);

  // 5. Create vehicle
  const { data: vehicle, error: vErr } = await supabase
    .from("vehicles")
    .insert({
      registration_number: "KA-99-TEST-0001",
      vehicle_type: "mini_truck",
      capacity_kg: 1000,
      is_active: true,
    })
    .select("id")
    .single();
  if (vErr) return { error: `Vehicle: ${vErr.message}` };
  testIds.vehicleId = vehicle.id;
  results.push(`Vehicle: ${vehicle.id}`);

  // 6. Create driver
  const { data: driver, error: dErr } = await supabase
    .from("drivers")
    .insert({
      name: "Test Driver",
      license_number: "KA99-TEST-DL001",
      phone: TEST_COLLECTOR_PHONE,
      is_active: true,
    })
    .select("id")
    .single();
  if (dErr) return { error: `Driver: ${dErr.message}` };
  testIds.driverId = driver.id;
  results.push(`Driver: ${driver.id}`);

  // 7. Link driver to vehicle
  const { error: vdErr } = await supabase.from("vehicle_drivers").insert({
    vehicle_id: vehicle.id,
    driver_id: driver.id,
  });
  if (vdErr) return { error: `Vehicle-driver link: ${vdErr.message}` };
  results.push("Vehicle-driver linked");

  // 8. Create org member
  const { error: omErr } = await supabase.from("organization_members").insert({
    user_id: bwgId,
    organization_id: org.id,
  });
  if (omErr) return { error: `Org member: ${omErr.message}` };

  // 9. Create pickup in "assigned" status
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split("T")[0];

  const { data: pickup, error: pErr } = await supabase
    .from("pickups")
    .insert({
      organization_id: org.id,
      requested_by: bwgId,
      farmer_id: farmerId,
      vehicle_id: vehicle.id,
      scheduled_date: dateStr,
      scheduled_slot: "morning",
      status: "assigned",
      estimated_weight_kg: 200,
    })
    .select("id")
    .single();
  if (pErr) return { error: `Pickup: ${pErr.message}` };
  testIds.pickupId = pickup.id;
  results.push(`Pickup: ${pickup.id} (assigned, date: ${dateStr})`);

  return { testIds, results };
}

async function cleanup() {
  const results: string[] = [];

  if (testIds.pickupId) {
    await supabase.from("pickup_events").delete().eq("pickup_id", testIds.pickupId);
    await supabase.from("pickup_trips").delete().eq("pickup_id", testIds.pickupId);
    await supabase.from("pickups").delete().eq("id", testIds.pickupId);
    results.push("Pickup + events + trips deleted");
  }

  if (testIds.vehicleId && testIds.driverId) {
    await supabase
      .from("vehicle_drivers")
      .delete()
      .eq("vehicle_id", testIds.vehicleId)
      .eq("driver_id", testIds.driverId);
    results.push("Vehicle-driver link deleted");
  }

  if (testIds.driverId) {
    await supabase.from("drivers").delete().eq("id", testIds.driverId);
    results.push("Driver deleted");
  }

  if (testIds.vehicleId) {
    await supabase.from("vehicles").delete().eq("id", testIds.vehicleId);
    results.push("Vehicle deleted");
  }

  if (testIds.bwgProfileId && testIds.orgId) {
    await supabase
      .from("organization_members")
      .delete()
      .eq("user_id", testIds.bwgProfileId)
      .eq("organization_id", testIds.orgId);
  }

  if (testIds.farmerProfileId) {
    await supabase.from("farmer_details").delete().eq("profile_id", testIds.farmerProfileId);
    await supabase.from("profiles").delete().eq("id", testIds.farmerProfileId);
    await supabase.auth.admin.deleteUser(testIds.farmerProfileId);
    results.push("Farmer deleted");
  }

  if (testIds.collectorProfileId) {
    await supabase.from("profiles").delete().eq("id", testIds.collectorProfileId);
    await supabase.auth.admin.deleteUser(testIds.collectorProfileId);
    results.push("Collector deleted");
  }

  if (testIds.bwgProfileId) {
    await supabase.from("profiles").delete().eq("id", testIds.bwgProfileId);
    await supabase.auth.admin.deleteUser(testIds.bwgProfileId);
    results.push("BWG deleted");
  }

  if (testIds.orgId) {
    await supabase.from("organizations").delete().eq("id", testIds.orgId);
    results.push("Organization deleted");
  }

  testIds = {};
  return { results };
}

export async function GET(req: NextRequest) {
  // Protected by CRON_SECRET — safe to run in production
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const step = req.nextUrl.searchParams.get("step") || "all";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

  const report: {
    step: string;
    status: "pass" | "fail" | "skip";
    detail: unknown;
  }[] = [];

  function assert(step: string, condition: boolean, detail: unknown) {
    report.push({ step, status: condition ? "pass" : "fail", detail });
    return condition;
  }

  try {
    // === SEED ===
    if (step === "seed" || step === "all") {
      const seedResult = await seed();
      if ("error" in seedResult) {
        return NextResponse.json({ error: seedResult.error, report });
      }
      assert("seed", !!testIds.pickupId, seedResult);
    }

    if (step === "seed") {
      return NextResponse.json({ report, testIds });
    }

    // === STEP 1: Job assigned notification ===
    if (step === "job-assigned" || step === "all") {
      const { sendJobAssignedNotification } = await import(
        "@/lib/whatsapp/notifications"
      );
      try {
        await sendJobAssignedNotification(testIds.pickupId!);
        assert("job-assigned", true, "Job assigned WhatsApp sent (check driver phone)");
      } catch (e) {
        assert("job-assigned", false, `Error: ${e}`);
      }
    }

    // === STEP 2: BWG email on job creation ===
    if (step === "bwg-email" || step === "all") {
      const { sendBwgPickupWhatsApp } = await import("@/lib/whatsapp/notifications");
      try {
        await sendBwgPickupWhatsApp(testIds.pickupId!);
        assert("bwg-pickup-whatsapp", true, `WhatsApp sent to BWG phone for ${TEST_BWG_EMAIL}`);
      } catch (e) {
        assert("bwg-pickup-email", false, `Error: ${e}`);
      }
    }

    // === STEP 3: Collector sends "picked up" ===
    if (step === "picked-up" || step === "all") {
      const res1 = await simulateTextWebhook(
        baseUrl,
        TEST_COLLECTOR_PHONE,
        "picked up"
      );
      assert(
        "collector-picked-up-prompt",
        res1.ok,
        `Response ok: ${res1.ok}, status: ${res1.status}`
      );

      // Simulate photo via Meta image message (handler downloads from Meta API using media ID)
      const res2 = await simulateImageWebhook(
        baseUrl,
        TEST_COLLECTOR_PHONE,
        "test_pickup_photo_id"
      );
      assert("collector-picked-up-photo", res2.ok, `Response ok: ${res2.ok}, status: ${res2.status}`);

      const statusAfterPickup = await getPickupStatus(testIds.pickupId!);
      assert(
        "db-status-picked-up",
        statusAfterPickup?.status === "picked_up",
        `Status: ${statusAfterPickup?.status}, photo: ${statusAfterPickup?.photo_before_url ? "yes" : "no"}`
      );
    }

    // === STEP 4: Collector sends "delivered" ===
    if (step === "delivered" || step === "all") {
      const res1 = await simulateTextWebhook(
        baseUrl,
        TEST_COLLECTOR_PHONE,
        "delivered"
      );
      assert(
        "collector-delivered-prompt",
        res1.ok,
        `Response ok: ${res1.ok}, status: ${res1.status}`
      );

      const res2 = await simulateImageWebhook(
        baseUrl,
        TEST_COLLECTOR_PHONE,
        "test_delivery_photo_id"
      );
      assert("collector-delivered-photo", res2.ok, `Response ok: ${res2.ok}, status: ${res2.status}`);

      const statusAfterDelivery = await getPickupStatus(testIds.pickupId!);
      assert(
        "db-status-delivered",
        statusAfterDelivery?.status === "delivered",
        `Status: ${statusAfterDelivery?.status}, delivered_at: ${statusAfterDelivery?.delivered_at ? "set" : "null"}`
      );
    }

    // === STEP 5: Farmer confirms receipt (via interactive button) ===
    if (step === "farmer-received" || step === "all") {
      const res = await simulateButtonWebhook(
        baseUrl,
        TEST_FARMER_PHONE,
        "received",
        "Received"
      );
      assert(
        "farmer-received-reply",
        res.ok,
        `Response ok: ${res.ok}, status: ${res.status}`
      );

      const statusAfterReceived = await getPickupStatus(testIds.pickupId!);
      assert(
        "db-status-received",
        statusAfterReceived?.status === "received",
        `Status: ${statusAfterReceived?.status}, farmer_responded_at: ${statusAfterReceived?.farmer_responded_at ? "set" : "null"}`
      );
    }

    // === STEP 5b (alternative): Farmer rejects (via interactive button) ===
    if (step === "farmer-rejected") {
      // Reset pickup to delivered for rejection test
      await supabase
        .from("pickups")
        .update({
          status: "delivered",
          farmer_responded_at: null,
          rejection_reason: null,
        })
        .eq("id", testIds.pickupId!);

      const res = await simulateButtonWebhook(
        baseUrl,
        TEST_FARMER_PHONE,
        "reject_mixed",
        "Reject-Mixed Waste"
      );
      assert(
        "farmer-rejected-reply",
        res.ok,
        `Response ok: ${res.ok}, status: ${res.status}`
      );

      const statusAfterReject = await getPickupStatus(testIds.pickupId!);
      assert(
        "db-status-rejected",
        statusAfterReject?.status === "rejected" &&
          statusAfterReject?.rejection_reason === "mixed_waste",
        `Status: ${statusAfterReject?.status}, reason: ${statusAfterReject?.rejection_reason}`
      );
    }

    // === STEP 6: Auto-accept test ===
    if (step === "auto-accept" || step === "all") {
      // Reset pickup to delivered with no farmer response for auto-accept test
      await supabase
        .from("pickups")
        .update({
          status: "delivered",
          farmer_responded_at: null,
          delivered_at: new Date().toISOString(),
        })
        .eq("id", testIds.pickupId!);

      const cronRes = await fetch(`${baseUrl}/api/cron/auto-accept`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      const cronData = await cronRes.json();
      assert(
        "auto-accept-cron",
        cronData.autoAccepted >= 1,
        cronData
      );

      const statusAfterAuto = await getPickupStatus(testIds.pickupId!);
      assert(
        "db-status-auto-received",
        statusAfterAuto?.status === "received",
        `Status: ${statusAfterAuto?.status}, farmer_responded_at: ${statusAfterAuto?.farmer_responded_at ? "set" : "null"}`
      );
    }

    // === STEP 7: Reminders cron (just verify it runs without error) ===
    if (step === "reminders" || step === "all") {
      const cronRes = await fetch(`${baseUrl}/api/cron/reminders`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      const cronData = await cronRes.json();
      assert("reminders-cron", cronData.ok === true, cronData);
    }

    // === EVENTS LOG ===
    if (step === "all") {
      const events = await getPickupEvents(testIds.pickupId!);
      report.push({
        step: "pickup-events-log",
        status: events.length > 0 ? "pass" : "skip",
        detail: events,
      });
    }

    // === CLEANUP ===
    if (step === "cleanup" || step === "all") {
      const cleanResult = await cleanup();
      assert("cleanup", true, cleanResult);
    }

    const passed = report.filter((r) => r.status === "pass").length;
    const failed = report.filter((r) => r.status === "fail").length;

    return NextResponse.json({
      summary: `${passed} passed, ${failed} failed, ${report.length} total`,
      report,
      testIds: step !== "all" && step !== "cleanup" ? testIds : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Unexpected error: ${error}`,
        report,
        testIds,
      },
      { status: 500 }
    );
  }
}
