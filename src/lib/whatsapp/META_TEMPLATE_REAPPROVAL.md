# Meta WhatsApp template re-approval guide

Re-submit templates in [Meta WhatsApp Manager](https://business.facebook.com/wa/manage/message-templates/) when the body text changes. **Existing variable numbers stay the same** — only append a footer line at the bottom of each template.

Footer format (add only the fields not already in the template):

```
Job {{n}} | {{n+1}} | Pickup {{n+2}}
```

Omit **pickup date** from the footer when the body already has a date variable. Omit **BWG name** when the body already has org/BWG name (`{{1}}` on collector templates).

Use **Utility** category where applicable. Language: `META_WA_TEMPLATE_LANG` (default `en`).

---

## 1. `farmer_delivery_incoming` (Processor — 24h reminder)

**Was:** 4 body variables. **Now:** 7 (same {{1}}–{{4}}, footer {{5}}–{{7}}).

**Suggested body:**
```
Delivery expected tomorrow.
Slot: {{1}}
From: {{2}}
Est. weight: {{3}}
Vehicle: {{4}}

Job {{5}} | {{6}} | Pickup {{7}}
```

| Var | Maps to |
|-----|---------|
| {{1}}–{{4}} | Unchanged (slot, collector, weight, vehicle) |
| {{5}} | Job ID |
| {{6}} | BWG name |
| {{7}} | Pickup date (DD/MM/YYYY) |

---

## 2. `farmer_delivery_eta` (Processor — en route)

**Was:** 2 variables. **Now:** 5.

**Suggested body:**
```
Waste picked up and heading to you.
ETA: ~{{1}} mins
Vehicle: {{2}}

Job {{3}} | {{4}} | Pickup {{5}}
```

---

## 3. `farmer_delivery_confirm` (Processor — accept delivery)

**CHANGE:** Remove rejection buttons. **Single quick reply — Accept** (payload: `accepted` or `1`).

**Was:** 0 variables. **Now:** 3 (footer only).

**Suggested body:**
```
Delivery has arrived. Tap Accept to confirm receipt.

Job {{1}} | {{2}} | Pickup {{3}}
```

---

## 4. `farmer_auto_accepted` (Processor — midnight auto-accept)

**Was:** 0 variables. **Now:** 3 (footer only).

**Suggested body:**
```
No response received. Delivery has been marked as accepted.

Job {{1}} | {{2}} | Pickup {{3}}
```

---

## 5. `bwg_pickup_scheduled` (BWG)

**Was:** 2 variables (date, slot). **Now:** 4 (footer adds Job ID + BWG only — date not repeated).

**Suggested body:**
```
Your waste pickup is scheduled.
Date: {{1}}
Time slot: {{2}}

A vehicle has been assigned. You will be notified once the waste is delivered.

Job {{3}} | {{4}}
```

| Var | Maps to |
|-----|---------|
| {{1}}–{{2}} | Unchanged (date, slot) |
| {{3}} | Job ID |
| {{4}} | BWG name |

---

## 6. `bwg_delivery_confirmed` (BWG)

**Was:** 2 variables. **Now:** 4 (same footer as pickup scheduled).

**Suggested body:**
```
Your waste has been delivered to the processing facility.
Date: {{1}}
Time slot: {{2}}

Thank you for contributing to sustainable waste management!

Job {{3}} | {{4}}
```

---

## 7. `collector_job_assigned` (Collector)

**Was:** 5 variables. **Now:** 6 (footer adds Job ID only — org name and date already in body).

**Suggested body:**
```
New pickup assigned.
Pickup from: {{1}}
Address: {{2}}
Date: {{3}}
Time slot: {{4}}
Location: {{5}}

Job {{6}}
```

| Var | Maps to |
|-----|---------|
| {{1}}–{{5}} | Unchanged (org/BWG name, address, date, slot, maps link) |
| {{6}} | Job ID |

---

## 8. `collector_pickup_reminder_24h` (Collector)

**Was:** 3 variables. **Now:** 5 (footer adds Job ID + pickup date — org name already {{1}}).

**Suggested body:**
```
Reminder: Pickup tomorrow at {{1}}.
Time slot: {{2}}
Location: {{3}}

Job {{4}} | Pickup {{5}}
```

---

## 9. `collector_pickup_reminder_1h` (Collector)

**Was:** 3 variables. **Now:** 5.

**Suggested body:**
```
Reminder: Pickup in 1 hour at {{1}}.
Time slot: {{2}}
Location: {{3}}

Job {{4}} | Pickup {{5}}
```

---

## Deprecated — do not re-submit

- **`farmer_waste_processed`** — removed from product (Phase 2). Archive or delete in Meta.

---

## After approval checklist

1. Approve updated templates in Meta (body text + footer only; existing {{1}}–{{n}} meanings unchanged).
2. Deploy app code that appends context parameters after existing ones.
3. Test via `/api/test/whatsapp-flow` or a staging job assign.
