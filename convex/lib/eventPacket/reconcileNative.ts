import type { QueryCtx, MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { decrypt } from "../encryption";
import {
  fieldLabel,
  reconcile,
  readiness,
} from "../../../src/lib/eventPacket/reconcile";
import {
  canonicalJson,
  fingerprintBytes,
  fingerprintSnapshot,
  type Fact,
  type EventPacketSnapshot,
  type Section,
} from "../../../src/lib/eventPacket/model";
import {
  requiredFacts,
  requirements,
  sectionFor,
} from "../../../src/lib/eventPacket/requirements";
type Ctx = QueryCtx | MutationCtx;
export const sections: Section[] = [
  "venue",
  "staffing",
  "timeline",
  "menu",
  "vehicles",
  "layouts",
  "equipment",
  "contacts",
  "packlist",
];
export async function scopedEvent(
  ctx: Ctx,
  tenantId: string,
  eventId: Id<"events">,
) {
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== tenantId || event.deletedAt != null)
    throw new Error("Event not found");
  return event;
}
export async function eventRows(
  ctx: Ctx,
  table: string,
  tenantId: string,
  eventId: string,
): Promise<any[]> {
  const rows = await (ctx.db as any)
    .query(table)
    .withIndex("by_eventId", (q: any) => q.eq("eventId", eventId))
    .collect();
  return rows.filter(
    (r: any) => r.tenantId === tenantId && r.deletedAt == null,
  );
}
async function related(
  ctx: Ctx,
  table: string,
  id: unknown,
  tenant: string,
): Promise<any | null> {
  if (typeof id !== "string") return null;
  const normalized = ctx.db.normalizeId(table as any, id);
  if (!normalized) return null;
  const row: any = await ctx.db.get(normalized);
  return row && row.tenantId === tenant && row.deletedAt == null ? row : null;
}
async function plain(
  ctx: Ctx,
  value: unknown,
  entity: string,
  property: string,
) {
  if (typeof value !== "string") return value;
  try {
    const envelope = JSON.parse(value);
    if (envelope?.v === 1 && envelope.ct && envelope.kid)
      return await decrypt(envelope.ct, envelope.kid, {
        ctx,
        entity,
        property,
      });
  } catch {}
  return value;
}
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export function localDate(ms: number, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ms);
  return ["year", "month", "day"]
    .map((t) => parts.find((p) => p.type === t)!.value)
    .join("-");
}
export function localTime(ms: number, zone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ms);
}
export async function readCurrentPacket(
  ctx: Ctx,
  tenantId: string,
  eventId: Id<"events">,
) {
  const event = await scopedEvent(ctx, tenantId, eventId);
  const files = await eventRows(ctx, "eventPacketArtifacts", tenantId, eventId);
  const sources = files.filter((f) => f.purpose === "source" && f.metadataJson);
  const context = sources[0]?.contextJson
    ? JSON.parse(sources[0].contextJson)
    : {};
  const zone = context.timeZone ?? "UTC";
  const artifactMetadata = sources.map((s) => JSON.parse(s.metadataJson));
  const observations = sources
    .filter((s) => JSON.parse(s.contextJson ?? "{}").active !== false)
    .flatMap((s) => JSON.parse(s.observationsJson ?? "[]"));
  const [issueRows, resolutionRows, revisionRows] = await Promise.all(
    ["eventPacketIssues", "eventPacketResolutions", "eventPacketRevisions"].map(
      (table) => eventRows(ctx, table, tenantId, eventId),
    ),
  );
  const facts: Fact[] = [];
  const add = (fieldKey: string, value: unknown, unit?: string) => {
    if (
      value !== undefined &&
      value !== null &&
      value !== "" &&
      (!Array.isArray(value) || value.length)
    )
      facts.push({
        fieldKey,
        value: value as any,
        unit,
        status: "confirmed",
        authority: "native_finalized",
        confidence: 1,
        evidence: [],
      });
  };
  add("eventTitle", event.title);
  add("guestCount", event.expectedHeadcount);
  if (event.startsAt != null) {
    add("eventDate", localDate(event.startsAt, zone));
    add("timeline.event_start.1.time", localTime(event.startsAt, zone));
  }
  if (event.endsAt != null)
    add("timeline.event_end.1.time", localTime(event.endsAt, zone));
  const style = await related(
    ctx,
    "serviceStyles",
    event.serviceStyleId,
    tenantId,
  );
  if (style) add("serviceStyle", style.name);
  const venue = await related(ctx, "venues", event.venueId, tenantId);
  add("venue.name", event.venueName ?? venue?.name);
  add("venue.address", event.venueAddress ?? venue?.addressLine1);
  const client = await related(ctx, "clients", event.clientId, tenantId);
  add(
    "clientName",
    client?.companyName ??
      [client?.givenName, client?.familyName].filter(Boolean).join(" "),
  );
  for (const [key, column] of [
    ["contact.name", "primaryContactName"],
    ["contact.phone", "primaryContactPhone"],
    ["contact.email", "primaryContactEmail"],
  ] as const)
    add(key, await plain(ctx, event[column], "Event", column));
  add("notes.setup", event.operationalRequirements);
  add("notes.access", event.accessibilityNeeds);
  add("notes.service", event.serviceRequirements);
  // Native service-plan values drive the Event Task Breakdown overlays.
  for (const column of [
    "mangiaDisposables",
    "eventRentals",
    "placeSettings",
    "waterOnsite",
    "tablesideWater",
    "buffetColdPlates",
    "buffetHotPlates",
    "stationaryApps",
    "cocktailHourFood",
    "beveragesOnMenu",
    "barService",
    "bussing",
    "dessertService",
    "scullery",
  ] as const)
    add(`ops.${column}`, (event as any)[column]);
  const styles = await ctx.db
    .query("serviceStyles")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  const nativeTargets: Record<string, { id: string; label: string }[]> = {
    serviceStyle: styles
      .filter((s) => s.deletedAt == null && s.status === "active")
      .map((s) => ({ id: s._id, label: s.name })),
  };
  const dishes = await eventRows(ctx, "eventDishes", tenantId, eventId);
  for (const line of dishes) {
    const dish = await related(ctx, "dishes", line.dishId, tenantId);
    if (!dish) continue;
    const key = "menu." + slug(dish.name);
    add(key + ".name", dish.name);
    add(key + ".quantity", line.quantityServings, "Serving");
    add(key + ".notes", line.specialInstructions);
    nativeTargets[key + ".quantity"] = [{ id: line._id, label: dish.name }];
  }
  const activities = await eventRows(
    ctx,
    "eventTimelineActivities",
    tenantId,
    eventId,
  );
  const counts: Record<string, number> = {};
  const milestones: Record<string, string> = {
    staff_on: "event_staff_on",
    shop_departure: "nlt",
    onsite_arrival: "arrive_onsite",
    service: "event_start",
    shop_return: "return_to_mangia_hq",
    staff_off: "event_staff_off",
  };
  for (const a of activities.sort(
    (a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0),
  )) {
    const label =
      milestones[a.timingMilestone] ?? slug(a.name).replaceAll("-", "_");
    const key = `timeline.${label}.${(counts[label] = (counts[label] ?? 0) + 1)}`;
    if (a.startsAt != null) {
      const old = facts.findIndex((f) => f.fieldKey === key + ".time");
      if (old >= 0) facts.splice(old, 1);
      add(key + ".time", localTime(a.startsAt, zone));
    }
    add(key + ".notes", a.notes);
    nativeTargets[key + ".time"] = [{ id: a._id, label: a.name }];
  }
  // Operational records participate in current hashes even when there is no source field mapping.
  for (const [table, prefix] of [
    ["eventAssignments", "crew"],
    ["eventStaffNeeds", "staffing"],
    ["equipmentReservations", "equipment"],
    ["deliveries", "vehicle"],
    ["eventLayoutSections", "layouts"],
    ["packLists", "packlist"],
  ] as const) {
    for (const row of await eventRows(ctx, table, tenantId, eventId)) {
      if (table === "deliveries" && row.status === "cancelled") continue;
      const {
        tenantId: _tenant,
        _creationTime,
        createdAt,
        updatedAt,
        ...operational
      } = row;
      add(`${prefix}.native-${row._id}`, canonicalJson(operational));
      if (table === "packLists") {
        const items = await ctx.db
          .query("packListItems")
          .withIndex("by_packListId", (q) => q.eq("packListId", row._id))
          .collect();
        for (const item of items)
          if (item.tenantId === tenantId && item.deletedAt == null) {
            const { _creationTime, createdAt, updatedAt, ...detail } = item;
            add(`packlist.native-item-${item._id}`, canonicalJson(detail));
          }
      }
    }
  }
  const snapshot: EventPacketSnapshot = {
    schemaVersion: 1,
    identity: {
      tenantId,
      eventId,
      invoiceNumber: context.invoiceNumber ?? String(eventId),
      eventDate:
        context.eventDate ??
        (event.startsAt ? localDate(event.startsAt, zone) : "1970-01-01"),
    },
    artifacts: artifactMetadata,
    observations,
    facts: [],
    issues: issueRows.map((r) => JSON.parse(r.issueJson)),
    resolutions: resolutionRows.map((r) => JSON.parse(r.decisionJson)),
    checklistVerifications: [],
    revisions: revisionRows.map((r) => ({
      id: r._id,
      snapshotFingerprint: r.snapshotFingerprint,
      createdAt: new Date(r.createdAt).toISOString(),
      stage: r.stage,
      ...(r.supersededBy ? { supersededBy: r.supersededBy } : {}),
    })),
    stage: "review",
  };
  const checks = new Map();
  for (const row of resolutionRows.sort((a, b) => a.decidedAt - b.decidedAt))
    if (row.verificationJson) {
      const check = JSON.parse(row.verificationJson);
      checks.set(check.checkKey, check);
    }
  snapshot.checklistVerifications = [...checks.values()];
  let reconciled = await reconcile(snapshot, facts);
  // A source agreement is evidence, never a substitute for an absent native operational record.
  for (const fact of reconciled.facts) {
    if (
      !/^(eventTitle|guestCount|serviceStyle|eventDate|clientName|venue\.|contact\.|notes\.|menu\.|timeline\.)/.test(
        fact.fieldKey,
      ) ||
      facts.some((f) => f.fieldKey === fact.fieldKey)
    )
      continue;
    fact.status = fact.value === undefined ? "missing" : "candidate";
    delete fact.authority;
    let issue = reconciled.issues.find(
      (i) => i.key === "fact." + fact.fieldKey,
    );
    if (!issue) {
      const key = "fact." + fact.fieldKey;
      issue = {
        id: key,
        key,
        fieldKey: fact.fieldKey,
        required: true,
        severity: "blocking",
        section: sectionFor(fact.fieldKey),
        printSection: sectionFor(fact.fieldKey),
        owner: "Operations",
        message:
          "Add or link the missing native operational detail before accepting source evidence",
        status: "open",
        evidence: fact.evidence,
        evidenceFingerprint: await fingerprintBytes(
          new TextEncoder().encode(
            canonicalJson({
              field: fact.fieldKey,
              value: fact.value,
              unit: fact.unit,
              native: "missing",
            }),
          ),
        ),
      };
      reconciled.issues.push(issue);
    }
    issue.status = "open";
    delete issue.verifiedAt;
  }
  reconciled.stage = readiness(reconciled) ? "ready" : "review";
  return {
    snapshot: reconciled,
    currentFingerprint: await fingerprintSnapshot(reconciled),
    nativeTargets,
    event,
    timeZone: zone,
    files,
    revisionRows,
  };
}
export function projectPacketReadiness(snapshot: EventPacketSnapshot) {
  const requiredOpenIssueCount = snapshot.issues.filter(
    (i) => i.required && i.status === "open",
  ).length;
  return {
    ready: readiness(snapshot),
    requiredOpenIssueCount,
    finalSignoffsComplete: [
      "check.signature.warehouse-ops",
      "check.signature.event-lead",
    ].every((key) =>
      snapshot.issues.some((i) => i.key === key && i.status === "resolved"),
    ),
    sections: sections.map((section) => {
      const open = snapshot.issues.filter(
        (i) => i.section === section && i.required && i.status === "open",
      );
      const openIssueCount = open.length;
      const ready = readiness(snapshot, section);
      return {
        section,
        status: ready ? ("ready" as const) : ("blocked" as const),
        openIssueCount,
        // What is blocking, in allowlisted static words only. `issue.message`
        // and menu/production/timeline field keys are built from source-document
        // text, so neither crosses to crew; those issues share one fixed label.
        openIssues: open.reduce<
          { label: string; owner: string; count: number }[]
        >((rows, i) => {
          const label =
            requirements.find((r) => r.key === i.key)?.message ??
            (requiredFacts.some((f) => f.fieldKey === i.fieldKey)
              ? fieldLabel(i.fieldKey)
              : "Source line to confirm in the event workbook");
          const row = rows.find((r) => r.label === label);
          if (row) row.count += 1;
          else rows.push({ label, owner: i.owner, count: 1 });
          return rows;
        }, []),
        urgentAction: ready
          ? null
          : "Operations review or required verification is pending",
      };
    }),
  };
}
export async function persistIssues(
  ctx: MutationCtx,
  tenantId: string,
  eventId: Id<"events">,
  snapshot: EventPacketSnapshot,
) {
  const rows = await eventRows(ctx, "eventPacketIssues", tenantId, eventId);
  for (const issue of snapshot.issues) {
    const old = rows.find((r) => r.issueKey === issue.key);
    const issueJson = canonicalJson(issue);
    if (old) {
      if (old.issueJson !== issueJson)
        await ctx.db.patch(old._id, { issueJson, updatedAt: Date.now() });
    } else
      await ctx.db.insert("eventPacketIssues", {
        tenantId,
        eventId,
        issueKey: issue.key,
        issueJson,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      });
  }
}
