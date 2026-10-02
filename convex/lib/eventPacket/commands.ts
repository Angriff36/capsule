import { v } from "convex/values";
import { api, internal } from "../../_generated/api";
import {
  action,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
  type ActionCtx,
} from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { getAuthContext, requireTenant } from "../authContext";
import { orgCapabilityDeniesAction } from "../orgCapabilityGate";
import { TenantSystemCommandRunner } from "../tenantSystemCommandRunner";
import {
  readCurrentPacket,
  scopedEvent,
  eventRows,
  persistIssues,
  localDate,
} from "./reconcileNative";
import { readFinalLockInput } from "./finalLockInput";
import {
  evaluateFinalLock,
  finalLockPrint,
  type FinalLockPrint,
} from "../../../src/lib/eventPacket/finalLock/evaluate";
import { appendFinalLockPages } from "../../../src/lib/eventPacket/finalLock/pdfStamp";
import { parsePacketSnapshot } from "../../../src/lib/eventPacket/packetContract";
import { resolveIssue } from "../../../src/lib/eventPacket/resolveIssue";
import { referenceKinds } from "../../../src/lib/eventPacket/groupSources";
import { sourceProvenance } from "../../../src/lib/eventPacket/sourceProvenance";
import {
  partFingerprints,
  staleParts,
} from "../../../src/lib/eventPacket/nativePacket";
import {
  summarizePacketRows,
  type SummaryClientLike,
  type SummaryEventLike,
} from "../../../src/lib/eventPacket/summaryProjection";
import {
  canonicalJson,
  fingerprintBytes,
  fingerprintSnapshot,
  type FieldValue,
} from "../../../src/lib/eventPacket/model";
const roles = new Set([
  "admin",
  "owner",
  "system",
  "manager",
  "event_manager",
  "finance_manager",
  "inventory_manager",
  "kitchen_manager",
  "logistics_manager",
  "sales_manager",
  "workforce_manager",
]);
const nativeEditableField = (fieldKey: string) =>
  [
    "serviceStyle",
    "guestCount",
    "venue.name",
    "venue.address",
    "contact.name",
    "contact.phone",
    "contact.email",
    "notes.setup",
    "notes.access",
    "notes.service",
  ].includes(fieldKey) || /^menu\..*\.quantity$/.test(fieldKey);
export const hasManagementAccess = (auth: { role: string; disabledCapabilities: string[] }) =>
  roles.has(auth.role) &&
  !orgCapabilityDeniesAction("manageAccess", auth.disabledCapabilities);
export async function authorize(ctx: any, eventId: Id<"events">) {
  const auth = await getAuthContext(ctx);
  const tenantId = requireTenant(auth);
  if (!hasManagementAccess(auth)) throw new Error("Management access required");
  if (ctx.db) await scopedEvent(ctx, tenantId, eventId);
  return { ...auth, tenantId };
}
const value = v.union(v.string(), v.number(), v.boolean(), v.array(v.string()));
const clean = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));
export const canManagePacket = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !hasManagementAccess(auth)) return false;
    await scopedEvent(ctx, auth.tenantId, eventId);
    return true;
  },
});
/** Cross-event workbook rows: counts as of the last import or decision. */
export const listPacketSummaries = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !hasManagementAccess(auth)) return null;
    const tenantId = auth.tenantId;
    const rows = async (
      table:
        | "eventPacketArtifacts"
        | "eventPacketIssues"
        | "eventPacketRevisions",
    ) =>
      (
        await (ctx.db as any)
          .query(table)
          .withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId))
          .collect()
      ).filter((r: any) => r.deletedAt == null);
    const [artifacts, issues, revisions] = await Promise.all([
      rows("eventPacketArtifacts"),
      rows("eventPacketIssues"),
      rows("eventPacketRevisions"),
    ]);
    const eventIds = new Set<string>([
      ...artifacts.map((r: any) => r.eventId as string),
      ...issues.map((r: any) => r.eventId as string),
      ...revisions.map((r: any) => r.eventId as string),
    ]);
    const events = new Map<string, SummaryEventLike>();
    const clients = new Map<string, SummaryClientLike>();
    for (const id of eventIds) {
      const event: any = await ctx.db.get(id as Id<"events">);
      if (!event || event.tenantId !== tenantId || event.deletedAt != null)
        continue;
      events.set(id, event);
      if (event.clientId && !clients.has(event.clientId)) {
        const client: any = await ctx.db.get(event.clientId);
        if (client && client.tenantId === tenantId && client.deletedAt == null)
          clients.set(event.clientId, client);
      }
    }
    return clean(
      summarizePacketRows({
        artifacts,
        issues,
        revisions,
        getEvent: (eventId) => events.get(eventId) ?? null,
        getClient: (clientId) => clients.get(clientId) ?? null,
      }),
    );
  },
});
const printFingerprint = (print: unknown) =>
  fingerprintBytes(new TextEncoder().encode(canonicalJson(print)));
/** Everything a stored revision printed, as canonical JSON; null for old rows. */
function storedPrintJson(row: { answersJson?: string | null }) {
  if (!row.answersJson) return null;
  const { revisionId: _revision, ...print } = JSON.parse(row.answersJson);
  return print.lines ? canonicalJson(print) : null;
}
/** The Final Lock answers a print shows now, with the packet they read. */
async function currentFinalLockPrint(
  ctx: QueryCtx | MutationCtx,
  tenantId: string,
  eventId: Id<"events">,
) {
  const lock = await readFinalLockInput(ctx, tenantId, eventId);
  const print = finalLockPrint(
    evaluateFinalLock(lock.input, { overrides: lock.overrides }),
  );
  return {
    packet: lock.packet,
    print,
    fingerprint: await printFingerprint(print),
  };
}
export const getPacket = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const auth = await authorize(ctx, eventId);
    const lock = await currentFinalLockPrint(ctx, auth.tenantId, eventId);
    const current = lock.packet;
    // A revision is current only when both its packet and every Final Lock
    // line it printed still match; old prints without answers reprint.
    const currentJson = canonicalJson(lock.print);
    const matches = (r: (typeof current.revisionRows)[number]) =>
      r.snapshotFingerprint === current.currentFingerprint &&
      storedPrintJson(r) === currentJson;
    const latest = current.revisionRows
      .slice()
      .sort(
        (a, b) =>
          Number(matches(b)) - Number(matches(a)) ||
          b.createdAt - a.createdAt,
      )[0];
    const staleSections =
      latest && !matches(latest) && latest.sectionsJson
        ? staleParts(
            JSON.parse(latest.sectionsJson),
            await partFingerprints(current.snapshot, currentJson),
          )
        : [];
    const sourceRows = (
      await eventRows(ctx, "eventPacketArtifacts", auth.tenantId, eventId)
    ).filter((r) => r.purpose === "source");
    const names = new Map<string, string>();
    for (const subject of new Set(sourceRows.map((r) => r.uploadedBy)))
      if (subject) {
        const person = (
          await ctx.db
            .query("people")
            .withIndex("by_authSubjectId", (q) =>
              q.eq("authSubjectId", subject),
            )
            .collect()
        ).find((p) => p.tenantId === auth.tenantId);
        const name = [person?.givenName, person?.familyName]
          .filter(Boolean)
          .join(" ");
        if (name) names.set(subject, name);
      }
    return clean({
      sources: sourceProvenance(
        sourceRows,
        (subject) => (subject && names.get(subject)) || "Someone not on the team list",
      ),
      snapshot: current.snapshot,
      currentFingerprint: current.currentFingerprint,
      finalLock: lock.print,
      finalLockFingerprint: lock.fingerprint,
      nativeTargets: current.nativeTargets,
      canManage: true,
      latestRevision: latest
        ? {
            id: latest._id,
            fingerprint: latest.snapshotFingerprint,
            stale: !matches(latest),
            staleSections,
            pdfUrl: await ctx.storage.getUrl(
              latest.pdfStorageId as Id<"_storage">,
            ),
            snapshotUrl: await ctx.storage.getUrl(
              latest.snapshotStorageId as Id<"_storage">,
            ),
          }
        : null,
    });
  },
});
export const registerFile = internalMutation({
  args: {
    eventId: v.id("events"),
    fingerprint: v.string(),
    storageId: v.id("_storage"),
    name: v.string(),
    mimeType: v.string(),
    byteSize: v.number(),
    purpose: v.string(),
    snapshotFingerprint: v.optional(v.string()),
    /** PDF: fingerprint of the Final Lock answers it shows. */
    finalLockFingerprint: v.optional(v.string()),
    /** Snapshot: the Final Lock answers the PDF shows, as uploaded. */
    finalLockJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.eventId);
    const old = (
      await eventRows(ctx, "eventPacketArtifacts", auth.tenantId, args.eventId)
    ).find(
      (r) => r.fingerprint === args.fingerprint && r.purpose === args.purpose,
    );
    if (old) {
      await ctx.storage.delete(args.storageId);
      return { storageId: old.storageId, fingerprint: old.fingerprint };
    }
    const {
      snapshotFingerprint,
      finalLockFingerprint,
      finalLockJson,
      ...file
    } = args;
    await ctx.db.insert("eventPacketArtifacts", {
      tenantId: auth.tenantId,
      ...file,
      storageId: args.storageId,
      contextJson: snapshotFingerprint
        ? JSON.stringify({
            snapshotFingerprint,
            ...(finalLockFingerprint ? { finalLockFingerprint } : {}),
            ...(finalLockJson ? { finalLockJson } : {}),
          })
        : undefined,
      uploadedBy: auth.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
    } as any);
    return { storageId: args.storageId, fingerprint: args.fingerprint };
  },
});

/** Short-lived upload URL; the browser sends source bytes directly to storage. */
export const generatePacketUploadUrl = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await authorize(ctx, eventId);
    return ctx.storage.generateUploadUrl();
  },
});

async function registerPacketBytes(
  ctx: any,
  args: {
    eventId: Id<"events">;
    storageId: Id<"_storage">;
    name: string;
    mimeType: string;
    purpose: "source" | "pdf" | "snapshot";
    inputFingerprint?: string;
    finalLockFingerprint?: string;
  },
  uploadedBytes: Uint8Array,
  /** The Final Lock answers as they are now, read by the caller's query. */
  current: {
    finalLock: FinalLockPrint;
    finalLockFingerprint: string;
    snapshot: { identity: { invoiceNumber: string; eventDate: string } };
  },
): Promise<{ storageId: string; fingerprint: string }> {
  let bytes = uploadedBytes;
  let storageId = args.storageId;
  let snapshotFingerprint: string | undefined =
    args.purpose === "pdf" ? args.inputFingerprint : undefined;
  let finalLockJson: string | undefined;
  if (args.purpose === "pdf" && !snapshotFingerprint)
    throw new Error(
      "PDF upload requires the fingerprint of the rendered snapshot",
    );
  if (args.purpose === "snapshot") {
    // The printed Final Lock answers ride beside the packet snapshot.
    const { finalLock, ...packet } = JSON.parse(new TextDecoder().decode(bytes));
    snapshotFingerprint = await fingerprintSnapshot(parsePacketSnapshot(packet));
    if (finalLock !== undefined) finalLockJson = canonicalJson(finalLock);
  }
  if (
    args.purpose === "pdf" &&
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  )
    throw new Error("Expected a PDF file");
  if (args.purpose === "pdf") {
    // The server draws the Final Lock answer pages into the PDF itself, from
    // the answers as they are now, so no uploaded file can leave them out.
    if (
      args.finalLockFingerprint !== undefined &&
      args.finalLockFingerprint !== current.finalLockFingerprint
    )
      throw new Error(
        "The Final Lock answers changed after the workbook was made; prepare the current workbook again",
      );
    bytes = await appendFinalLockPages(
      uploadedBytes,
      current.finalLock,
      current.snapshot.identity,
    );
    storageId = await ctx.storage.store(
      new Blob([new Uint8Array(bytes)], { type: args.mimeType }),
    );
    await ctx.storage.delete(args.storageId);
    finalLockJson = canonicalJson(current.finalLock);
  }
  return ctx.runMutation(internal.lib.eventPacket.commands.registerFile, {
    eventId: args.eventId,
    fingerprint: await fingerprintBytes(bytes),
    storageId,
    name: args.name,
    mimeType: args.mimeType,
    byteSize: bytes.byteLength,
    purpose: args.purpose,
    ...(snapshotFingerprint ? { snapshotFingerprint } : {}),
    ...(args.purpose === "pdf"
      ? { finalLockFingerprint: current.finalLockFingerprint }
      : {}),
    ...(finalLockJson ? { finalLockJson } : {}),
  });
}

/** Register a browser-uploaded blob after validating its exact bytes. */
export const registerPacketUpload = action({
  args: {
    eventId: v.id("events"),
    storageId: v.id("_storage"),
    name: v.string(),
    mimeType: v.string(),
    purpose: v.union(
      v.literal("source"),
      v.literal("pdf"),
      v.literal("snapshot"),
    ),
    inputFingerprint: v.optional(v.string()),
    finalLockFingerprint: v.optional(v.string()),
  },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{ storageId: string; fingerprint: string }> => {
    await authorize(ctx, args.eventId);
    const blob = await ctx.storage.get(args.storageId);
    if (!blob) throw new Error("Uploaded packet file was not found");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    try {
      const current = await ctx.runQuery(
        api.lib.eventPacket.commands.getPacket,
        { eventId: args.eventId },
      );
      return await registerPacketBytes(ctx, args, bytes, current);
    } catch (error) {
      // A PDF upload may already have been replaced by the server's copy.
      await ctx.storage.delete(args.storageId).catch(() => undefined);
      throw error;
    }
  },
});

export const uploadPacketFile = action({
  args: {
    eventId: v.id("events"),
    bytes: v.bytes(),
    name: v.string(),
    mimeType: v.string(),
    purpose: v.union(
      v.literal("source"),
      v.literal("pdf"),
      v.literal("snapshot"),
    ),
    inputFingerprint: v.optional(v.string()),
    finalLockFingerprint: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ storageId: string; fingerprint: string }> => {
    await authorize(ctx, args.eventId);
    const current = await ctx.runQuery(
      api.lib.eventPacket.commands.getPacket,
      { eventId: args.eventId },
    );
    const bytes = new Uint8Array(args.bytes);
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: args.mimeType }),
    );
    return registerPacketBytes(ctx, {
      eventId: args.eventId,
      storageId,
      name: args.name,
      mimeType: args.mimeType,
      purpose: args.purpose,
      inputFingerprint: args.inputFingerprint,
      finalLockFingerprint: args.finalLockFingerprint,
    }, bytes, current);
  },
});
export const importEvidence = mutation({
  args: {
    eventId: v.id("events"),
    snapshotJson: v.string(),
    artifacts: v.array(
      v.object({ fingerprint: v.string(), storageId: v.id("_storage") }),
    ),
    timeZone: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.eventId);
    new Intl.DateTimeFormat("en", { timeZone: args.timeZone }).format();
    const incoming = parsePacketSnapshot(args.snapshotJson);
    if (incoming.identity.eventId && incoming.identity.eventId !== args.eventId)
      throw new Error("Source belongs to a different native event");
    const native = await scopedEvent(ctx, auth.tenantId, args.eventId);
    // Reference files (diagrams, forms, training) carry no event number or
    // date: kept on this event, they neither set nor test its identity.
    const identifies = incoming.artifacts.some(
      (a) => !referenceKinds.has(a.kind),
    );
    if (
      identifies &&
      native.startsAt != null &&
      localDate(native.startsAt, args.timeZone) !== incoming.identity.eventDate
    )
      throw new Error("Source date does not match this event");
    const owned = await eventRows(
      ctx,
      "eventPacketArtifacts",
      auth.tenantId,
      args.eventId,
    );
    const established = owned.find(
      (r) =>
        r.purpose === "source" &&
        r.metadataJson &&
        r.contextJson &&
        JSON.parse(r.contextJson).invoiceNumber,
    );
    if (
      identifies &&
      established &&
      JSON.parse(established.contextJson).invoiceNumber !==
        incoming.identity.invoiceNumber
    )
      throw new Error(
        "Source invoice does not match the established event packet",
      );
    for (const artifact of incoming.artifacts) {
      const supplied = args.artifacts.find(
        (a) => a.fingerprint === artifact.fingerprint,
      );
      const file = owned.find(
        (r) =>
          r.fingerprint === artifact.fingerprint &&
          r.storageId === supplied?.storageId &&
          r.purpose === "source",
      );
      if (!file)
        throw new Error(
          "Upload every source into this event before importing evidence",
        );
      const observations = incoming.observations.filter(
        (o) => o.evidence[0]?.artifactFingerprint === artifact.fingerprint,
      );
      for (const previous of owned)
        if (
          previous._id !== file._id &&
          previous.purpose === "source" &&
          previous.name === file.name &&
          previous.metadataJson &&
          JSON.parse(previous.metadataJson).kind === artifact.kind &&
          !incoming.artifacts.some(
            (a) => a.fingerprint === previous.fingerprint,
          )
        )
          await ctx.db.patch(previous._id, {
            contextJson: canonicalJson({
              ...JSON.parse(previous.contextJson ?? "{}"),
              active: false,
            }),
            updatedAt: Date.now(),
          });
      const observationsJson = canonicalJson(observations);
      if (new TextEncoder().encode(observationsJson).byteLength > 900_000)
        throw new Error(
          "Source observations exceed one Convex document; split the source report",
        );
      const metadata = {
        ...artifact,
        name: file.name,
        mimeType: file.mimeType,
        importedAt: new Date(file.createdAt).toISOString(),
      };
      await ctx.db.patch(file._id, {
        metadataJson: canonicalJson(metadata),
        observationsJson,
        contextJson: canonicalJson({
          ...(identifies
            ? {
                invoiceNumber: incoming.identity.invoiceNumber,
                eventDate: incoming.identity.eventDate,
              }
            : {}),
          timeZone: args.timeZone,
          quarantinedApprovals:
            incoming.resolutions.length +
            incoming.checklistVerifications.length,
          quarantinedFacts: incoming.facts.length,
        }),
        updatedAt: Date.now(),
      });
    }
    const current = await readCurrentPacket(ctx, auth.tenantId, args.eventId);
    await persistIssues(ctx, auth.tenantId, args.eventId, current.snapshot);
    return {
      currentFingerprint: current.currentFingerprint,
      requiredOpenIssueCount: current.snapshot.issues.filter(
        (i) => i.required && i.status === "open",
      ).length,
    };
  },
});
export const resolveOperationalIssue = mutation({
  args: {
    eventId: v.id("events"),
    issueId: v.string(),
    evidenceFingerprint: v.string(),
    choice: value,
    reason: v.optional(v.string()),
    observationId: v.optional(v.string()),
    answer: v.optional(
      v.union(v.literal("yes"), v.literal("no"), v.literal("not_applicable")),
    ),
    unit: v.optional(v.string()),
    nativeTargetId: v.optional(v.string()),
    kind: v.optional(
      v.union(
        v.literal("fact_choice"),
        v.literal("fact_entry"),
        v.literal("verification"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.eventId);
    let current = await readCurrentPacket(ctx, auth.tenantId, args.eventId);
    const issue = current.snapshot.issues.find((i) => i.id === args.issueId);
    if (!issue) throw new Error("Issue not found");
    if (issue.evidenceFingerprint !== args.evidenceFingerprint)
      throw new Error(
        "This decision was reviewed against older evidence; refresh the event workbook and review the current issue",
      );
    const fact = current.snapshot.facts.find(
      (f) => f.fieldKey === issue.fieldKey,
    );
    const source = args.observationId
      ? current.snapshot.observations.find(
          (o) => o.id === args.observationId && o.fieldKey === issue.fieldKey,
        )
      : undefined;
    if (
      args.observationId &&
      (!source || canonicalJson(source.value) !== canonicalJson(args.choice))
    )
      throw new Error("Choice does not match the selected source");
    if (
      !issue.key.startsWith("check.") &&
      nativeEditableField(issue.fieldKey) &&
      (fact?.authority !== "native_finalized" ||
        canonicalJson(fact.value) !== canonicalJson(args.choice) ||
        (fact.unit !== args.unit && args.unit !== undefined))
    ) {
      const event = current.event;
      const params = { docId: event._id, version: event.version };
      const key = issue.fieldKey;
      if (key === "serviceStyle") {
        const id = ctx.db.normalizeId(
          "serviceStyles",
          args.nativeTargetId ?? "",
        );
        const style = id ? await ctx.db.get(id) : null;
        if (
          !style ||
          style.tenantId !== auth.tenantId ||
          style.deletedAt != null ||
          style.name !== args.choice
        )
          throw new Error(
            "Choose the matching service style for this organization",
          );
        await ctx.runMutation(api.mutations.Event_changeServiceStyle, {
          ...params,
          serviceStyleId: style._id,
        });
      } else if (key === "guestCount" && typeof args.choice === "number")
        await ctx.runMutation(api.mutations.Event_changeHeadcount, {
          ...params,
          newHeadcount: args.choice,
        });
      else if (key === "venue.name" || key === "venue.address")
        await ctx.runMutation(api.mutations.Event_changeVenue, {
          ...params,
          venueId: event.venueId ?? undefined,
          venueName:
            key === "venue.name"
              ? String(args.choice)
              : (event.venueName ?? undefined),
          venueAddress:
            key === "venue.address"
              ? String(args.choice)
              : (event.venueAddress ?? undefined),
          venueCapacity: event.venueCapacity ?? undefined,
        });
      else if (key.startsWith("contact.")) {
        const get = (k: string) =>
          String(
            current.snapshot.facts.find((f) => f.fieldKey === k)?.value ?? "",
          );
        await ctx.runMutation(api.mutations.Event_changePrimaryContact, {
          ...params,
          primaryContactName:
            key === "contact.name" ? String(args.choice) : get("contact.name"),
          primaryContactPhone:
            key === "contact.phone"
              ? String(args.choice)
              : get("contact.phone"),
          primaryContactEmail:
            key === "contact.email"
              ? String(args.choice)
              : get("contact.email"),
        });
      } else if (key.startsWith("notes."))
        await ctx.runMutation(api.mutations.Event_changeRequirements, {
          ...params,
          accessibilityNeeds:
            key === "notes.access"
              ? Array.isArray(args.choice)
                ? args.choice
                : [String(args.choice)]
              : (event.accessibilityNeeds ?? []),
          operationalRequirements:
            key === "notes.setup"
              ? String(args.choice)
              : (event.operationalRequirements ?? undefined),
          serviceRequirements:
            key === "notes.service"
              ? String(args.choice)
              : (event.serviceRequirements ?? undefined),
        });
      else if (
        /^menu\..*\.quantity$/.test(key) &&
        typeof args.choice === "number"
      ) {
        const id = ctx.db.normalizeId(
          "eventDishes",
          args.nativeTargetId ?? current.nativeTargets[key]?.[0]?.id ?? "",
        );
        const dish = id ? await ctx.db.get(id) : null;
        if (
          !dish ||
          dish.tenantId !== auth.tenantId ||
          dish.eventId !== args.eventId ||
          dish.deletedAt != null
        )
          throw new Error("Choose a dish already on this event");
        if (
          (args.unit ?? source?.unit ?? "Serving").toLowerCase() !== "serving"
        )
          throw new Error(
            "Native menu quantities are servings; resolve the unit conversion before updating",
          );
        await ctx.runMutation(api.mutations.EventDish_adjustServings, {
          docId: dish._id,
          version: dish.version,
          quantityServings: args.choice,
        });
      } else
        throw new Error(
          "Update or link this detail in its native event editor, then confirm the current value",
        );
      current = await readCurrentPacket(ctx, auth.tenantId, args.eventId);
    }
    const at = new Date().toISOString();
    const updated = await resolveIssue(
      current.snapshot,
      {
        issueId: args.issueId,
        choice: args.choice,
        reason: args.reason ?? "",
        actor: auth.id,
        at,
        observationId: args.observationId,
        answer: args.answer,
        unit: args.unit,
        kind: args.kind ?? (args.answer ? "verification" : "fact_choice"),
      },
      current.snapshot.facts.filter((f) => f.authority === "native_finalized"),
    );
    const decision = updated.resolutions.at(-1)!;
    const verification = updated.checklistVerifications.find(
      (c) => c.checkKey === issue.key,
    );
    await ctx.db.insert("eventPacketResolutions", {
      tenantId: auth.tenantId,
      eventId: args.eventId,
      decisionId: decision.id,
      issueKey: issue.key,
      actor: auth.id,
      decidedAt: Date.parse(at),
      decisionJson: canonicalJson(decision),
      ...(verification
        ? { verificationJson: canonicalJson(verification) }
        : {}),
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const refreshed = await readCurrentPacket(ctx, auth.tenantId, args.eventId);
    await persistIssues(ctx, auth.tenantId, args.eventId, refreshed.snapshot);
    return { currentFingerprint: refreshed.currentFingerprint };
  },
});
export const recordPacketRevision = mutation({
  args: {
    eventId: v.id("events"),
    inputFingerprint: v.string(),
    /** Fingerprint of the Final Lock answers the PDF shows. */
    finalLockFingerprint: v.string(),
    pdfStorageId: v.id("_storage"),
    snapshotStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.eventId);
    const lock = await currentFinalLockPrint(ctx, auth.tenantId, args.eventId);
    const current = lock.packet;
    if (args.inputFingerprint !== current.currentFingerprint)
      throw new Error(
        "Event or source evidence changed; prepare the current workbook again",
      );
    const answersChanged = new Error(
      "The Final Lock answers changed after the workbook was made; prepare the current workbook again",
    );
    // Every print, a retry too, must upload files that carry the answers
    // it names, checked before any earlier print is reused.
    const pdf = current.files.find(
      (f) => f.storageId === args.pdfStorageId && f.purpose === "pdf",
    );
    const snapshot = current.files.find(
      (f) => f.storageId === args.snapshotStorageId && f.purpose === "snapshot",
    );
    const pdfContext = JSON.parse(pdf?.contextJson ?? "{}");
    const snapshotContext = JSON.parse(snapshot?.contextJson ?? "{}");
    if (
      !pdf ||
      pdfContext.snapshotFingerprint !== args.inputFingerprint ||
      !snapshot ||
      snapshotContext.snapshotFingerprint !== args.inputFingerprint
    )
      throw new Error(
        "Print files must be owned by this event and contain the exact current snapshot",
      );
    // The PDF's answer pages were drawn by the server from these answers;
    // the snapshot must name the very same answers.
    const uploaded =
      typeof snapshotContext.finalLockJson === "string"
        ? JSON.parse(snapshotContext.finalLockJson)
        : null;
    if (
      !uploaded?.lines ||
      pdfContext.finalLockJson !== snapshotContext.finalLockJson ||
      (await printFingerprint(uploaded)) !== args.finalLockFingerprint
    )
      throw new Error(
        "Print files must carry the Final Lock answers this workbook shows",
      );
    // A new print and a retry alike must show every line as it is now:
    // office answers, readiness and field forms.
    if (args.finalLockFingerprint !== lock.fingerprint) throw answersChanged;
    // Reuse only a print of this packet that stored exactly these lines.
    const uploadedJson = canonicalJson(uploaded);
    let existing = null;
    for (const r of current.revisionRows)
      if (
        r.snapshotFingerprint === args.inputFingerprint &&
        storedPrintJson(r) === uploadedJson
      )
        existing = r;
    if (existing) {
      for (const row of current.revisionRows) {
        if (row._id === existing._id && row.supersededBy)
          await ctx.db.patch(row._id, {
            supersededBy: undefined,
            updatedAt: Date.now(),
          });
        else if (row._id !== existing._id && row.supersededBy !== existing._id)
          await ctx.db.patch(row._id, {
            supersededBy: existing._id,
            updatedAt: Date.now(),
          });
      }
      return {
        id: existing._id,
        fingerprint: existing.snapshotFingerprint,
        reused: true,
      };
    }
    const id = await ctx.db.insert("eventPacketRevisions", {
      tenantId: auth.tenantId,
      eventId: args.eventId,
      snapshotFingerprint: args.inputFingerprint,
      pdfStorageId: args.pdfStorageId,
      snapshotStorageId: args.snapshotStorageId,
      stage: current.snapshot.stage,
      createdBy: auth.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    // Store the uploaded answers payload the PDF shows, so each answer
    // names its revision and a later change names the stale questions.
    await ctx.db.patch(id, {
      answersJson: canonicalJson({
        revisionId: id,
        ...JSON.parse(snapshotContext.finalLockJson),
      }),
      sectionsJson: canonicalJson(
        await partFingerprints(current.snapshot, uploadedJson),
      ),
    });
    for (const old of current.revisionRows)
      if (!old.supersededBy)
        await ctx.db.patch(old._id, {
          supersededBy: id,
          updatedAt: Date.now(),
        });
    // A binder built from an earlier print is out of date now: the tracker
    // shows it as not built until someone rebuilds it from this print.
    const event = await ctx.db.get(args.eventId);
    if (current.revisionRows.length > 0 && event?.binderBuiltAt != null)
      await TenantSystemCommandRunner.forTenant(
        ctx,
        auth.tenantId,
      ).context.runMutation(api.mutations.Event_clearBinderBuilt, {
        docId: args.eventId,
        version: event.version,
      });
    return { id, fingerprint: args.inputFingerprint, reused: false };
  },
});
export const sourceUrl = query({
  args: { eventId: v.id("events"), fingerprint: v.string() },
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.eventId);
    const file = (
      await eventRows(ctx, "eventPacketArtifacts", auth.tenantId, args.eventId)
    ).find((r) => r.fingerprint === args.fingerprint && r.purpose === "source");
    return file ? ctx.storage.getUrl(file.storageId as Id<"_storage">) : null;
  },
});
export const revisionUrl = query({
  args: { eventId: v.id("events"), revisionId: v.id("eventPacketRevisions") },
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.eventId);
    const row = await ctx.db.get(args.revisionId);
    if (!row || row.tenantId !== auth.tenantId || row.eventId !== args.eventId)
      throw new Error("Revision not found");
    return {
      pdfUrl: await ctx.storage.getUrl(row.pdfStorageId as Id<"_storage">),
      snapshotUrl: await ctx.storage.getUrl(
        row.snapshotStorageId as Id<"_storage">,
      ),
    };
  },
});
