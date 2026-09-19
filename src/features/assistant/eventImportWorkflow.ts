import type { ConvexReactClient } from "convex/react";
import type { FunctionReference } from "convex/server";
import { api } from "../../lib/api";
import { asDocId } from "../../agent/CapsuleEventBundleStepRunner";
import { eventDetailPath } from "../events/eventRoutes";
import {
  eventImportFactsSchema,
  missingImportFacts,
  parseEventImportDraft,
  type EventImportDraft,
  type EventImportSource,
  type EventImportFacts,
} from "../../lib/eventImportDraft";

type Row = Record<string, unknown>;
const queries = api.queries as unknown as Record<
  string,
  FunctionReference<"query">
>;
const mutations = api.mutations as unknown as Record<
  string,
  FunctionReference<"mutation">
>;
const nameKey = (name: unknown) =>
  typeof name === "string"
    ? name.trim().normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ")
    : "";
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? value.filter((r) => r && typeof r === "object" && r.deletedAt == null)
    : [];
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function nativeFacts(facts: EventImportFacts, issues: string[]): Row {
  const args: Row = {};
  for (const key of [
    "title",
    "eventType",
    "expectedHeadcount",
    "primaryContactName",
    "primaryContactEmail",
    "primaryContactPhone",
    "venueName",
    "venueAddress",
    "budgetAmount",
    "quotedPrice",
    "serviceRequirements",
    "operationalRequirements",
  ] as const) {
    const value = facts[key];
    if (value != null && value !== "") args[key] = value;
  }
  for (const key of ["startsAt", "endsAt"] as const) {
    const value = facts[key];
    if (!value) continue;
    if (
      /T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
      Number.isFinite(Date.parse(value))
    )
      args[key] = Date.parse(value);
    else
      issues.push(
        `${key}: retained as printed; a date, time and timezone are needed before scheduling.`,
      );
  }
  if (
    typeof args.startsAt === "number" &&
    typeof args.endsAt === "number" &&
    args.endsAt <= args.startsAt
  ) {
    delete args.startsAt;
    delete args.endsAt;
    issues.push(
      "Printed start/end times conflict; scheduling fields remain blank.",
    );
  }
  return args;
}

/** Same governed commands and signed-in permissions as Event editors. */
export async function saveEventFromBeo(
  convex: ConvexReactClient,
  input: unknown,
  context: {
    sources: EventImportSource[];
    sourceText: string;
    isActive?: () => boolean;
    existingEventId?: string;
  },
): Promise<Record<string, unknown>> {
  const facts = eventImportFactsSchema.parse(input);
  const auth = await convex.query(api.authStatus.getAuthStatus, {});
  if (!auth.authenticated || !auth.tenantId)
    throw new Error("Sign in to your workspace before importing an event.");
  if (!context.sources.length && !context.sourceText.trim())
    throw new Error("Attach a BEO or paste its source text before importing.");
  const sourceKey = `beo:${auth.tenantId}:${await digest(
    context.sources.length
      ? context.sources
          .map((f) => f.fingerprint ?? f.storageId)
          .sort()
          .join("|")
      : context.sourceText,
  )}`;
  let draft: EventImportDraft = {
    version: 1,
    sourceKey,
    sources: context.sources,
    sourceText: context.sourceText,
    facts,
    menu: (facts.menu ?? []).map((line) => ({ ...line, status: "unresolved" })),
    missing: missingImportFacts(facts),
    issues: [...(facts.discrepancies ?? [])],
    status: "saved",
  };
  const initialFacts = nativeFacts(draft.facts, draft.issues);
  const call = async (name: string, args: Row) => {
    if (context.isActive && !context.isActive())
      throw new Error("Import paused. Its saved draft can be resumed.");
    const ref = mutations[name];
    if (!ref) throw new Error(`Command ${name} is unavailable.`);
    return convex.mutation(ref, args);
  };
  let eventId = context.existingEventId ?? "";
  if (!eventId) {
    eventId = asDocId(
      await call("Event_createViaCaptureDraft", {
        ...initialFacts,
        title:
          initialFacts.title ??
          `Imported event — ${context.sources[0]?.name ?? "BEO"}`,
        importSourceKey: sourceKey,
        importDraftJson: JSON.stringify(draft),
        idempotencyKey: `${sourceKey}:draft`,
      }),
    );
  }
  // The create command's durable idempotency key returns the same event even
  // when the response was lost. Read its latest progress, never replay a
  // model's shorter retelling over already saved facts or staff edits.
  let current: Row | null;
  try {
    current = await convex.query(queries.getEvent, { id: eventId });
  } catch (error) {
    return {
      saved: true,
      eventId,
      eventUrl: eventDetailPath(eventId, "overview"),
      status: "paused",
      error: message(error),
      message:
        "Event draft saved, but its progress could not be read. Resume using this event ID.",
    };
  }
  if (!current || current.importSourceKey !== sourceKey) {
    return {
      saved: true,
      eventId,
      eventUrl: eventDetailPath(eventId, "overview"),
      status: "paused",
      error:
        "Could not read the saved import in this workspace. No further records were changed.",
    };
  }
  const prior = parseEventImportDraft(current.importDraftJson);
  if (prior) draft = prior;
  // Source discrepancies remain; transient lookup failures are re-evaluated.
  draft.issues = [...(draft.facts.discrepancies ?? [])];
  nativeFacts(draft.facts, draft.issues);
  const result = () => ({
    eventId,
    eventUrl: eventDetailPath(eventId, "overview"),
    status: draft.status,
    saved: true,
    missing: draft.missing,
    issues: draft.issues,
    menu: draft.menu.map(({ name, quantity, unit, status, reason }) => ({
      name,
      quantity,
      unit,
      status,
      reason,
    })),
    message:
      "Event draft saved. Missing facts remain blank. Import completion is not operational readiness or final approval.",
  });
  const checkpoint = async (extra: Row = {}) => {
    const latest = await convex.query(queries.getEvent, { id: eventId });
    if (!latest)
      throw new Error(
        "The saved event is no longer accessible. Import paused.",
      );
    const blanksOnly = Object.fromEntries(
      Object.entries(extra).filter(
        ([key]) => latest[key] == null || latest[key] === "",
      ),
    );
    await call("Event_updateImportDraft", {
      docId: eventId,
      ...blanksOnly,
      ...(typeof latest.version === "number"
        ? { version: latest.version }
        : {}),
      importDraftJson: JSON.stringify(draft),
    });
  };
  try {
    draft.status = "matching";
    await checkpoint();
    for (const source of draft.sources) {
      if (source.attachmentId) continue;
      if (source.fileSize == null) {
        draft.issues.push(
          `${source.name}: original upload is retained; reattach it to the event to supply file metadata.`,
        );
        continue;
      }
      try {
        source.attachmentId = asDocId(
          await call("Attachment_createViaAttach", {
            parentType: "eventRecord",
            parentId: eventId,
            fileName: source.name,
            contentType: source.mime ?? "application/octet-stream",
            fileSize: source.fileSize,
            storageId: source.storageId,
            idempotencyKey: `${sourceKey}:attachment:${source.fingerprint ?? source.storageId}`,
          }),
        );
        await checkpoint();
      } catch (error) {
        draft.issues.push(`Could not attach ${source.name}: ${message(error)}`);
      }
    }
    const matches: Row = {};
    // Failed reads are surfaced independently; they never erase the saved extraction.
    for (const [field, queryName, target] of [
      ["clientName", "listClientByTenantId", "clientId"],
      ["venueName", "listVenueByTenantId", "venueId"],
    ] as const) {
      if (!draft.facts[field]) continue;
      try {
        const candidates = rows(
          await convex.query(queries[queryName], { tenantId: "caller" }),
        ).filter((row) =>
          [
            row.name,
            row.displayName,
            row.companyName,
            [row.givenName, row.familyName].filter(Boolean).join(" "),
          ].some((name) => nameKey(name) === nameKey(draft.facts[field])),
        );
        if (candidates.length === 1) matches[target] = candidates[0]._id;
        else
          draft.issues.push(
            `${field}: ${candidates.length ? "multiple matches" : "no exact visible match"}; source name retained for review.`,
          );
      } catch (error) {
        draft.issues.push(`${field} lookup failed: ${message(error)}`);
      }
    }
    await checkpoint(matches);
    let catalog: Row[] = [];
    try {
      catalog = rows(
        await convex.query(queries.listDishByTenantId, { tenantId: "caller" }),
      );
    } catch (error) {
      draft.issues.push(`Menu catalog lookup failed: ${message(error)}`);
    }
    let existingMenu: Row[] | null = null;
    try {
      existingMenu = rows(
        await convex.query(queries.listEventDishByEventId, { eventId }),
      );
    } catch (error) {
      draft.issues.push(
        `Existing event menu could not be checked: ${message(error)}`,
      );
    }
    for (let index = 0; index < draft.menu.length; index++) {
      const line = draft.menu[index];
      if (line.status === "linked") continue;
      const candidates = catalog.filter(
        (row) =>
          row.status !== "retired" &&
          !row.mergedIntoDishId &&
          nameKey(row.name) === nameKey(line.name),
      );
      if (candidates.length !== 1) {
        line.reason = candidates.length
          ? "Multiple matching dishes; choose in review."
          : "No exact visible catalog match; original line retained.";
        continue;
      }
      if (
        line.quantity == null ||
        !Number.isInteger(line.quantity) ||
        !/^(serving|servings|portion|portions)$/i.test(line.unit ?? "")
      ) {
        line.reason =
          "Original quantity/unit retained; serving count is not established.";
        continue;
      }
      if (existingMenu === null) {
        line.reason =
          "Existing menu could not be checked. Source line retained to avoid adding a duplicate.";
        continue;
      }
      const sameDish = existingMenu.filter(
        (row) =>
          row.removedAt == null &&
          row.dishId === candidates[0]._id &&
          nameKey(row.course) === nameKey(line.course),
      );
      if (sameDish.length) {
        const exact = sameDish.filter(
          (row) =>
            row.quantityServings === line.quantity &&
            nameKey(row.specialInstructions) === nameKey(line.instructions),
        );
        if (exact.length === 1) {
          line.dishId = String(candidates[0]._id);
          line.eventDishId = String(exact[0]._id);
          line.status = "linked";
          delete line.reason;
        } else
          line.reason =
            "This dish already appears on the event with different or ambiguous details; current menu left unchanged.";
        await checkpoint();
        continue;
      }
      try {
        line.eventDishId = asDocId(
          await call("EventDish_createViaAddToEvent", {
            eventId,
            dishId: candidates[0]._id,
            quantityServings: line.quantity,
            ...(line.course ? { course: line.course } : {}),
            ...(line.instructions
              ? { specialInstructions: line.instructions }
              : {}),
            idempotencyKey: `${sourceKey}:menu:${index}`,
          }),
        );
        line.dishId = String(candidates[0]._id);
        line.status = "linked";
        delete line.reason;
      } catch (error) {
        line.reason = `Could not attach dish: ${message(error)}`;
      }
      await checkpoint();
    }
    draft.issues = [...new Set(draft.issues)];
    draft.status =
      draft.issues.length ||
      draft.missing.length ||
      draft.menu.some((line) => line.status === "unresolved")
        ? "needs-review"
        : "complete";
    await checkpoint();
    return result();
  } catch (error) {
    return {
      ...result(),
      status: "paused",
      error: message(error),
      message:
        "Draft saved. Resume this same BEO to continue; completed commands will not be duplicated.",
    };
  }
}
