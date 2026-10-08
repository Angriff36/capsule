// AUTHOR SEAM — phone (push) alerts that did not reach a phone, kept where a
// manager can see them. Before this, a failed push was only a server log line,
// so nobody knew a cook's phone had stopped getting shift and chat alerts.
//
// One ledger row per failure spell per device (entity PushDevice, entityId =
// the device row id): a device that keeps failing does not add a row per
// alert, and a device that gets an alert again (lastUsedAt moves past the
// failure) or is turned on again (updatedAt moves) counts as fine. 404/410 devices are retired by the senders and
// drop out on their own. No push-service error text is stored.
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { live } from "./lib/teamChatRead";

export const PUSH_DEVICE_ENTITY = "PushDevice";
const PUSH_FAILED_TYPE = "PushDeliveryFailed";

function lastFailureAt(rows: Doc<"manifestEvents">[]): number | null {
  let latest: number | null = null;
  for (const row of rows) {
    if (row.type !== PUSH_FAILED_TYPE) continue;
    if (latest == null || row.createdAt > latest) latest = row.createdAt;
  }
  return latest;
}

/** Last time the phone got an alert or was turned on again; a failure before this is over. */
function freshSince(device: Doc<"pushSubscriptions">): number {
  return Math.max(device.lastUsedAt ?? 0, device.updatedAt ?? 0);
}

/** Called by every push sender's result step for devices that did not take the alert. */
export async function recordPushFailures(
  ctx: MutationCtx,
  failed: Id<"pushSubscriptions">[],
  now: number,
): Promise<void> {
  for (const id of failed) {
    const device = await ctx.db.get(id);
    if (!device || !live(device)) continue;
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", String(id)))
      .collect();
    const latest = lastFailureAt(
      rows.filter((row) => row.entity === PUSH_DEVICE_ENTITY),
    );
    // Already failing and nothing has reached it since: same spell.
    if (latest != null && latest >= freshSince(device)) continue;
    await ctx.db.insert("manifestEvents", {
      type: PUSH_FAILED_TYPE,
      entity: PUSH_DEVICE_ENTITY,
      entityId: String(id),
      payload: { tenantId: device.tenantId, personId: device.personId },
      createdAt: now,
    });
  }
}

export interface PhoneAlertHealth {
  /** Live phones whose last alert arrived. */
  reached: number;
  /** Live phones whose last alert did not arrive. */
  missed: number;
  /** Since when the oldest of those has missed alerts. */
  missedSince: number | null;
  /** Who owns those phones, one name per person. */
  missedBy: string[];
}

export async function phoneAlertHealthFor(
  ctx: QueryCtx,
  tenantId: string,
): Promise<PhoneAlertHealth> {
  const devices = await ctx.db
    .query("pushSubscriptions")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  // Failure rows per live device (one row per failure spell), never every
  // workspace's PushDevice history.
  const failuresByDevice = new Map<string, Doc<"manifestEvents">[]>();
  await Promise.all(
    devices.filter(live).map(async (device) => {
      const rows = await ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q) => q.eq("entityId", String(device._id)))
        .collect();
      failuresByDevice.set(
        String(device._id),
        rows.filter((row) => {
          const payload = row.payload as { tenantId?: unknown } | null;
          return (
            row.entity === PUSH_DEVICE_ENTITY && payload?.tenantId === tenantId
          );
        }),
      );
    }),
  );

  const health: PhoneAlertHealth = {
    reached: 0,
    missed: 0,
    missedSince: null,
    missedBy: [],
  };
  const missedPeople = new Set<Id<"people">>();
  for (const device of devices) {
    if (!live(device)) continue;
    const failedAt = lastFailureAt(
      failuresByDevice.get(String(device._id)) ?? [],
    );
    if (failedAt != null && failedAt >= freshSince(device)) {
      health.missed += 1;
      missedPeople.add(device.personId);
      if (health.missedSince == null || failedAt < health.missedSince) {
        health.missedSince = failedAt;
      }
    } else if (device.lastUsedAt != null) {
      health.reached += 1;
    }
  }
  for (const personId of missedPeople) {
    const person = await ctx.db.get(personId);
    if (person && person.tenantId === tenantId) {
      health.missedBy.push(`${person.givenName} ${person.familyName}`.trim());
    }
  }
  health.missedBy.sort();
  return health;
}
