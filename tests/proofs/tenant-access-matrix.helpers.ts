/**
 * Runtime proof (PL-AUTH, AC-151 / PR12-10 negative matrix; AC-212; AC-403):
 * two workspaces, A and B, each with one record in EVERY workspace-owned
 * table. Record links point at the same workspace's own records, and every
 * number in workspace A is 7331 (workspace B uses 1), so a leaked total or
 * count changes the answer.
 *
 * Every public read and write in convex/ runs as each role of workspace B
 * (linked staff profiles), a workspace B sign-in with no staff profile, a
 * signed-out caller, and a removed person of workspace A. Arguments point at
 * workspace A: its id, its record ids, its parent ids, its sign-ins, file
 * addresses and outside keys (LINK_TABLE maps every link name the plural rule
 * cannot read; an unmapped name fails the test). Each optional argument that
 * names one of these is also sent on its own. Reads send the stored text and
 * numbers (so filters match A's records); in outside writes, text, numbers,
 * flags and choices differ from the stored ones.
 *
 * - Reads: the same caller runs the same call in a copy with NO workspace A
 *   records. The two answers (value or error text) must be identical, so no
 *   name, number, flag, record or "exists / does not exist" difference from
 *   workspace A reaches the caller. Workspace A's ids simply do not exist in
 *   the copy, so this is also the real-versus-missing id check for every read.
 * - Writes: no workspace A record changes, disappears or appears, checked
 *   after each accepted call and after each function; and the call gets the
 *   same answer in the copy without workspace A.
 *
 * Per-function ledger (tenant-access-matrix.ledger.json): for each read,
 * whether workspace A's owner gets a different answer because of workspace
 * A's records; for each write, whether the owner's call changes a workspace A
 * record; otherwise the owner's own result, as the reason the probe cannot
 * reach further. A read or write the ledger records as reaching must keep
 * reaching. Refresh with UPDATE_MATRIX_LEDGER=1 (or empty / delete the file).
 * Synthetic data only.
 *
 * This module holds the machinery; the tenant-access-matrix.*.runtime.test.ts
 * files each run one slice (reads, writes for some callers, the owner read
 * ledger, the owner write ledger), so test workers run the slices side by
 * side instead of one after another.
 */
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, vi } from "vitest";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

export function useMatrixClock() {
  beforeAll(() => {
    if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
      process.env.CONVEX_FIELD_ENCRYPTION_KEY =
        "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
    }
    // Same clock in both copies, so answers compare exactly.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.UTC(2026, 8, 27, 12) });
  });
  afterAll(() => {
    vi.useRealTimers();
  });
}

export const TENANT_A = "matrix-tenant-a";
export const TENANT_B = "matrix-tenant-b";
const MARK = "matrix-probe";
const NUMBER: Record<string, number> = { [TENANT_A]: 7331, [TENANT_B]: 1 };
export const LEDGER_PATH = fileURLToPath(
  new URL("./tenant-access-matrix.ledger.json", import.meta.url),
);

/** Every role the generated role table knows (convex/queries.ts ROLE_PERMISSIONS). */
export const ROLES = [
  "owner",
  "admin",
  "manager",
  "system",
  "staff",
  "driver",
  "event_manager",
  "event_staff",
  "finance_manager",
  "finance_staff",
  "inventory_manager",
  "inventory_staff",
  "kitchen_lead",
  "kitchen_manager",
  "kitchen_staff",
  "logistics_manager",
  "logistics_staff",
  "procurement_staff",
  "sales_manager",
  "sales_staff",
  "workforce_manager",
  "workforce_staff",
] as const;

type Json =
  | { type: "string" | "number" | "bigint" | "boolean" | "null" | "any" }
  | { type: "bytes" }
  | { type: "id"; tableName: string }
  | { type: "literal"; value: unknown }
  | { type: "array"; value: Json }
  | { type: "record"; keys: Json; values: { fieldType: Json } }
  | { type: "union"; value: Json[] }
  | {
      type: "object";
      value: Record<string, { fieldType: Json; optional: boolean }>;
    };

export type Doc = Record<string, unknown>;
export type Harness = ReturnType<typeof convexTest>;
type Fn = {
  isQuery?: boolean;
  isMutation?: boolean;
  isPublic?: boolean;
  exportArgs?: () => string;
};
/** One workspace: its id and its seeded record per table. */
type Side = { tenant: string; seeded: Map<string, string> };

type TableDef = { validator: { json: Json } };
export const tables = (
  schema as unknown as { tables: Record<string, TableDef> }
).tables;

/** Workspace-owned tables: the ones whose records carry a tenantId. */
export const tenantTables = Object.entries(tables)
  .filter(([, def]) => {
    const json = def.validator.json;
    return json.type === "object" && "tenantId" in json.value;
  })
  .map(([name]) => name);

const tenantTableSet = new Set(tenantTables);

/**
 * Text link names the plural rule below cannot read, each checked by hand
 * against the .manifest source / convex seam (review 2026-09-27). Values:
 * a workspace table, or
 * - "@sign-in": holds a sign-in (user.id), filled with the workspace owner's;
 * - "@file": a stored file address;
 * - "@outside": a key from another system or a fixed list (provider ids,
 *   tax number, report keys, webhook endpoint keys, package list).
 * Sign-ins, files and outside keys get one value per workspace, so a record
 * of workspace A and an argument aimed at it carry the same text.
 * The test fails on any *Id / *Ids name that is neither here nor readable by
 * the plural rule, so a new link name cannot be skipped silently.
 */
const LINK_TABLE: Record<string, string> = {
  acceptedRevisionId: "proposalRevisions",
  activeDishId: "dishes",
  activeEventId: "events",
  activeServiceStyleId: "serviceStyles",
  activityId: "eventTimelineActivities",
  actorId: "@sign-in",
  // PL-AUDIT step history: who ran the step, and the step's event row.
  actorPersonId: "people",
  actorUserId: "@sign-in",
  apiKeyId: "@outside",
  appliedById: "@sign-in",
  appliedImportRunId: "importRuns",
  appliedInventoryItemId: "inventoryItems",
  approvedById: "people",
  archiveStorageId: "@file",
  archivedById: "@sign-in",
  assignedById: "@sign-in",
  // PL-SALES habits: who answered first, followed up, logged the objection.
  firstRepliedById: "@sign-in",
  followUpById: "@sign-in",
  priceObjectionById: "@sign-in",
  assignedToId: "people",
  assignedToPersonId: "people",
  facilitatorPersonId: "people",
  partnerOwnerPersonId: "people",
  assigneePersonIds: "people",
  authSubjectId: "@sign-in",
  authorAuthSubjectId: "@sign-in",
  authorId: "@sign-in",
  brandLogoStorageId: "@file",
  logoStorageId: "@file",
  businessApprovedById: "@sign-in",
  cancelledById: "@sign-in",
  capsuleId: "events",
  capturedByAuthSubjectId: "@sign-in",
  capturedByPersonId: "people",
  channelId: "@outside",
  checkedByPersonId: "people",
  checklistTemplateId: "eventChecklists",
  childComponentId: "components",
  closedById: "@sign-in",
  completedById: "@sign-in",
  completedByPersonId: "people",
  closedByPersonId: "people",
  openedByPersonId: "people",
  setByPersonId: "people",
  confirmedByUserId: "@sign-in",
  contactId: "clientContacts",
  correctedById: "people",
  countedById: "@sign-in",
  createdByPersonId: "people",
  decidedByUserId: "@sign-in",
  decisionId: "@outside",
  defaultVendorId: "vendors",
  // Id-list reads of the 2026-10-08 screen windows
  // (convex/inventoryWindow.ts, convex/facilitiesHistoryWindow.ts).
  demandIds: "ingredientDemands",
  definedById: "@sign-in",
  dependentTaskId: "prepTasks",
  doneByPersonId: "people",
  destinationInventoryItemId: "inventoryItems",
  destinationLocationId: "storageLocations",
  driverId: "people",
  duplicateClientId: "clients",
  endpointId: "@outside",
  entityId: "events",
  // Plated service: the event-menu line a guest picked as their entrée.
  entreeEventDishId: "eventDishes",
  eventStaffingPersonId: "people",
  eventStaffingSourceIds: "eventStaffNeeds",
  excludedByPersonId: "people",
  exportedById: "people",
  issueRaisedById: "people",
  issueSettledById: "people",
  overrideApprovedById: "people",
  returnCheckedById: "people",
  returnCountedByPersonId: "people",
  externalAccountId: "@outside",
  externalChannelId: "@outside",
  externalCandidateId: "@outside",
  externalId: "@outside",
  externalInterviewId: "@outside",
  externalPaymentId: "@outside",
  // Inbox (2026-10-10): the company's Facebook page and Instagram account.
  facebookPageId: "@outside",
  hiredPersonId: "people",
  importId: "componentImports",
  instagramAccountId: "@outside",
  interviewerPersonId: "people",
  issueId: "eventPacketIssues",
  lastImportRunId: "importRuns",
  lastSeenImportRunId: "importRuns",
  leadPersonId: "people",
  lineLoadedByPersonId: "people",
  loadAssignmentId: "eventVehicleAssignments",
  loadRuleId: "@outside",
  locationId: "storageLocations",
  locationIds: "storageLocations",
  // Dish versions (2026-10-04): the main dish a version belongs to.
  mainDishId: "dishes",
  maintenanceScheduleId: "vehicleMaintenanceSchedules",
  manifestEventId: "@outside",
  maintenanceTaskId: "equipmentMaintenanceTasks",
  makeUpForBatchId: "productionBatches",
  matchedComponentId: "components",
  matchedExternalId: "@outside",
  matchedIngredientId: "ingredients",
  mentionedPersonIds: "people",
  // PL-INBOX: the conversation a duplicate thread was merged into.
  mergedIntoThreadId: "messageThreads",
  targetThreadId: "messageThreads",
  // TPP whole-account import: the upload a stored part belongs to.
  uploadId: "tppUploads",
  missingByPersonId: "people",
  nativeTargetId: "events",
  observationId: "@outside",
  openedByAuthSubjectId: "@sign-in",
  openedById: "@sign-in",
  openingStockConfirmedById: "@sign-in",
  otherPersonId: "people",
  overrideOfDishTaskId: "dishTasks",
  ownerId: "@sign-in",
  ownerPersonId: "people",
  packageId: "@outside",
  packedByPersonId: "people",
  // PL-DELIVERY who-did-it fields: set by the server from the signed-in
  // person, never sent by the screen.
  loadedByPersonId: "people",
  dispatchedByPersonId: "people",
  departedByPersonId: "people",
  deliveredByPersonId: "people",
  preloadedByPersonId: "people",
  reportedByPersonId: "people",
  // Skills matrix: who gave the rating.
  ratedByPersonId: "people",
  // Training sign-off: who trained the trainee.
  trainerPersonId: "people",
  // PL-FIELD-CONFIRMATION day-of forms: planned people are picked by the
  // office; who signed, checked or chased is the signed-in person.
  responsiblePersonId: "people",
  secondPersonId: "people",
  formCompletedById: "people",
  formCheckedById: "people",
  formEscalatedById: "people",
  photoStorageId: "@file",
  parentId: "events",
  partEquipmentId: "equipments",
  partnerClientId: "clients",
  partnerPersonId: "people",
  pdfStorageId: "@file",
  portionSpecId: "componentPortionSpecs",
  possibleMatchIngredientIds: "ingredients",
  postedById: "@sign-in",
  predecessorTaskId: "prepTasks",
  preferredVendorId: "vendors",
  preferredVendorIds: "vendors",
  previousComponentId: "components",
  previousStaffNeedId: "eventStaffNeeds",
  primaryClientId: "clients",
  primaryContactId: "vendorContacts",
  primaryImageStorageId: "@file",
  providerAccountId: "@outside",
  providerIds: "@outside",
  providerMessageId: "@outside",
  providerReversalId: "@outside",
  providerThreadId: "@outside",
  providerTransactionIds: "@outside",
  purchaseEligibleEventId: "events",
  raisedById: "@sign-in",
  reactivatedById: "@sign-in",
  realmId: "@outside",
  // Dish versions (2026-10-04): the dish whose recipe a version cooks from.
  recipeDishId: "dishes",
  recipeSyncComponentId: "components",
  recipeSyncDishId: "dishes",
  recipeSyncIngredientId: "ingredients",
  recipientAuthSubjectId: "@sign-in",
  // importResolution.chooseExistingRecord: the record an import item is
  // pointed at; contact rows (the usual case) live in clients.
  recordId: "clients",
  recipientContactId: "clientContacts",
  recipientPersonId: "people",
  reconciledById: "@sign-in",
  reconciledByUserId: "@sign-in",
  recordedById: "@sign-in",
  recordedByPersonId: "people",
  recurrenceSeriesId: "@outside",
  remainingSourceIds: "eventStaffNeeds",
  replacesProposalId: "proposals",
  reportId: "@outside",
  reportedById: "@sign-in",
  requesterAuthSubjectId: "@sign-in",
  requesterPersonId: "people",
  requiredQualificationId: "qualifications",
  requiredTrainingCompletionId: "trainingCompletions",
  requiredTrainingModuleId: "trainingModules",
  resolvedByUserId: "@sign-in",
  resultingComponentId: "components",
  reviewedByAuthSubjectId: "@sign-in",
  reviewedById: "@sign-in",
  reviewerId: "people",
  revisedById: "proposals",
  revokedByPersonId: "people",
  rideVehicleAssignmentId: "eventVehicleAssignments",
  salespersonId: "people",
  scorecardId: "roleScorecards",
  senderAuthSubjectId: "@sign-in",
  sentInsteadByPersonId: "people",
  sequenceAfterDishTaskId: "dishTasks",
  seriesId: "@outside",
  sessionIds: "stockCountSessions",
  setAsideById: "@sign-in",
  settledById: "@sign-in",
  snapshotStorageId: "@file",
  sourceDishComponentId: "dishComponents",
  sourceDishId: "dishes",
  sourceDishIngredientId: "dishIngredients",
  sourceEventId: "events",
  sourceImportRunId: "importRuns",
  sourceRowsStorageId: "@file",
  sourceTemplateId: "venueLayoutTemplates",
  sourceIngredientId: "ingredients",
  sourceIds: "referralSources",
  sourceInventoryItemId: "inventoryItems",
  sourceInvoiceId: "invoices",
  sourceLocationId: "storageLocations",
  sourceQualificationId: "qualifications",
  sourceTimeRecordIds: "timeRecords",
  staffMemberId: "people",
  staffNeedId: "eventStaffNeeds",
  stagedById: "@sign-in",
  startedById: "@sign-in",
  storageId: "@file",
  storageIds: "@file",
  subjectId: "clientContacts",
  substituteIngredientIds: "ingredients",
  takenOverByPersonId: "people",
  targetDishComponentId: "dishComponents",
  targetDishContainerId: "dishContainers",
  targetDishId: "dishes",
  targetDishIngredientId: "dishIngredients",
  targetDishTaskId: "dishTasks",
  targetId: "events",
  targetIngredientId: "ingredients",
  targetInvoiceId: "invoices",
  targetQualificationId: "qualifications",
  targetTrainingCompletionId: "trainingCompletions",
  taskOwnerAssignedToId: "people",
  taskOwnerAuthSubjectId: "@sign-in",
  taxId: "@outside",
  taskIds: "equipmentMaintenanceTasks",
  threadId: "messageThreads",
  timingLoadOverrideByPersonId: "people",
  timingLoadRuleId: "@outside",
  timingSetupOverrideByPersonId: "people",
  triggerEquipmentId: "equipments",
  updatedById: "@sign-in",
  uploadedByAuthSubjectId: "@sign-in",
  uploadedById: "@sign-in",
  verifiedByUserId: "@sign-in",
  voidedById: "@sign-in",
  waitsForTaskId: "eventTasks",
  yieldCorrectedById: "@sign-in",
};

/** What a text field named like a link points at, or null when it is plain text. */
function linkKind(field: string): string | null {
  const match = /^(.+?)Ids?$/.exec(field);
  if (!match || field === "tenantId") return null;
  const base = match[1]!;
  const candidates =
    base === "person"
      ? ["people"]
      : [`${base}s`, `${base}es`, `${base.replace(/y$/, "ie")}s`, base];
  return (
    candidates.find((name) => tenantTableSet.has(name)) ??
    LINK_TABLE[field] ??
    null
  );
}

/** Sign-in of each workspace's active owner (see makeWorld). */
function ownerSignIn(tenant: string): string {
  return tenant === TENANT_A ? "matrix-owner-a" : "matrix-owner-b";
}

function linkValue(kind: string, side: Side): string {
  if (kind === "@sign-in") return ownerSignIn(side.tenant);
  if (kind === "@file") return `matrix-file-${side.tenant}`;
  if (kind === "@outside") return `matrix-outside-${side.tenant}`;
  // Not seeded yet during the first seeding pass; the second pass links it.
  return side.seeded.get(kind) ?? MARK;
}

/** Values the arguments send where they do not aim at a record: never the stored ones. */
const PROBE_TEXT = "matrix-probe-argument";
const PROBE_NUMBER = 4242;

/**
 * One deterministic value for a field rule. Records use the workspace's own
 * values; arguments (`probe`) aim links at the same records but send other
 * text, numbers, flags and choices, so an accepted update cannot be a no-op.
 */
function fill(rule: Json, field: string, side: Side, probe = false): unknown {
  switch (rule.type) {
    case "string": {
      if (field === "tenantId") return side.tenant;
      const kind = linkKind(field);
      if (kind) return linkValue(kind, side);
      return probe ? PROBE_TEXT : MARK;
    }
    case "number":
      return probe ? PROBE_NUMBER : NUMBER[side.tenant];
    case "bigint":
      return BigInt(probe ? PROBE_NUMBER : NUMBER[side.tenant]!);
    case "boolean":
      return probe;
    case "null":
      return null;
    case "any":
      return probe ? PROBE_TEXT : MARK;
    case "bytes":
      return new ArrayBuffer(1);
    case "id":
      return side.seeded.get(rule.tableName) ?? `7${rule.tableName}`;
    case "literal":
      return rule.value;
    case "array": {
      const item = rule.value;
      const names =
        item.type === "id" ||
        (item.type === "string" && linkKind(field) !== null);
      return names ? [fill(item, field, side, probe)] : [];
    }
    case "record":
      return {};
    case "union": {
      const members = rule.value.filter((m) => m.type !== "null");
      const pick = probe ? members.at(-1) : members[0];
      return fill(pick ?? rule.value[0]!, field, side, probe);
    }
    case "object": {
      const out: Doc = {};
      for (const [key, spec] of Object.entries(rule.value)) {
        if (spec.optional) continue;
        out[key] = fill(spec.fieldType, key, side, probe);
      }
      return out;
    }
  }
}

/** True when a field rule is text (or a list / choice of text). */
function isText(rule: Json): boolean {
  if (rule.type === "string") return true;
  if (rule.type === "array") return isText(rule.value);
  if (rule.type === "union") return rule.value.some(isText);
  return false;
}

/** Every text *Id / *Ids name in public arguments and workspace records the test cannot aim. */
export function unreadableLinkNames(entries: Entry[]): string[] {
  const out = new Set<string>();
  const check = (key: string, rule: Json, where: string) => {
    if (key === "tenantId" || !/Ids?$/.test(key) || !isText(rule)) return;
    const kind = linkKind(key);
    if (!kind) out.add(`${key} (${where})`);
    else if (!kind.startsWith("@") && !tenantTableSet.has(kind))
      out.add(`${key} -> ${kind} is not a workspace table (${where})`);
  };
  for (const entry of entries) {
    if (entry.args?.type !== "object") continue;
    for (const [key, spec] of Object.entries(entry.args.value))
      check(key, spec.fieldType, entry.path);
  }
  for (const table of tenantTables) {
    const json = tables[table]!.validator.json;
    if (json.type !== "object") continue;
    for (const [key, spec] of Object.entries(json.value))
      check(key, spec.fieldType, table);
  }
  return [...out].sort();
}

export type Entry = {
  path: string;
  kind: "query" | "mutation";
  args: Json | null;
};

export async function publicFunctions(): Promise<Entry[]> {
  const out: Entry[] = [];
  for (const [file, load] of Object.entries(modules)) {
    const rel = file.replace(/^\.\.\/\.\.\/convex\//, "");
    if (rel.startsWith("_generated/") || rel === "schema.ts") continue;
    if (rel.endsWith(".d.ts") || rel === "crons.ts" || rel === "http.ts")
      continue;
    const mod = (await load()) as Record<string, unknown>;
    const base = rel.replace(/\.(ts|js)$/, "");
    for (const [name, value] of Object.entries(mod)) {
      const fn = value as Fn | null;
      if (!fn || (typeof fn !== "function" && typeof fn !== "object")) continue;
      if (!fn.isPublic) continue;
      const kind = fn.isQuery ? "query" : fn.isMutation ? "mutation" : null;
      if (!kind) continue;
      const raw = fn.exportArgs?.();
      const parsed = raw ? (JSON.parse(raw) as Json) : null;
      out.push({ path: `${base}:${name}`, kind, args: parsed });
    }
  }
  return out;
}

/**
 * Functions where holding a device secret IS the permission (the push
 * endpoint only the phone knows, see convex/pushSubscriptions.ts). A caller
 * from outside does not hold workspace A's secret, so it sends another one.
 * register re-owns a browser's alerts to whoever is signed in on it now,
 * which needs the same secret address.
 */
const DEVICE_SECRET_ARGS: Record<string, string> = {
  "pushSubscriptions:releaseByEndpoint": "endpoint",
  "pushSubscriptions:register": "endpoint",
};

/**
 * Writes whose answer may differ with workspace A present, with the reason.
 * They still must not change any workspace A record.
 */
export const ANSWER_MAY_DIFFER: Record<string, string> = {
  // A stored-file address is a long random secret, like the phone alert
  // address above. Refusing to register a file some record already uses is
  // what stops anyone claiming another company's file (convex/assistantConfig.ts).
  "assistantConfig:registerUpload": "stored-file address is a secret",
};

/**
 * Optional arguments that name a record, a sign-in, a file, an outside key
 * or a workspace. Every text *Id / *Ids name is readable (unreadableLinkNames
 * must be empty), so each one gets its own variant.
 */
function linkArgs(entry: Entry): string[] {
  const rule = entry.args;
  if (!rule || rule.type !== "object") return [];
  return Object.entries(rule.value)
    .filter(([key, spec]) => {
      if (!spec.optional) return false;
      if (key === "tenantId" || linkKind(key)) return true;
      const t =
        spec.fieldType.type === "union"
          ? spec.fieldType.value.find((m) => m.type !== "null")
          : spec.fieldType;
      return t?.type === "id" || (t?.type === "array" && t.value.type === "id");
    })
    .map(([key]) => key);
}

/**
 * Arguments for one function; `extra` adds one optional argument. Reads and
 * the owner's own calls send the stored values, so a filter on a name or a
 * number finds workspace A's record. Outside writes (`outsider`) send other
 * text, numbers, flags and choices, so an accepted update cannot be a no-op.
 */
export function argsFor(
  entry: Entry,
  side: Side,
  extra: string | null,
  outsider = false,
): Doc {
  const rule = entry.args;
  if (!rule || rule.type !== "object") return {};
  const out: Doc = {};
  for (const [key, spec] of Object.entries(rule.value)) {
    if (spec.optional && key !== extra) continue;
    out[key] =
      outsider && DEVICE_SECRET_ARGS[entry.path] === key
        ? "matrix-not-the-device-secret"
        : fill(spec.fieldType, key, side, outsider);
  }
  return out;
}

export function variants(entry: Entry): (string | null)[] {
  return [null, ...linkArgs(entry)];
}

/**
 * The website quote form is open to anyone by design: it lists the names of
 * the published company's active service styles, occasions and "how did you
 * hear about us" choices (PL-QUOTE). It must give nothing else — only _id,
 * name and sortOrder on each option, and the caterer's public name and
 * address (#125).
 */
export const PUBLIC_QUOTE_FORM = "quoteBuilder:getQuoteFormOptions";
export function publicQuoteFormExtras(value: unknown): string[] {
  const extra: string[] = [];
  const form = (value ?? {}) as Record<string, unknown>;
  for (const [key, list] of Object.entries(form)) {
    if (key === "company") {
      for (const field of Object.keys((list ?? {}) as Doc))
        // The caterer's own public contact details, shown to the client.
        if (!["name", "address", "phone", "website"].includes(field))
          extra.push(`company.${field}`);
      continue;
    }
    if (
      key !== "serviceStyles" &&
      key !== "occasions" &&
      key !== "referralSources"
    )
      extra.push(key);
    for (const option of Array.isArray(list) ? (list as Doc[]) : []) {
      for (const field of Object.keys(option)) {
        if (!["_id", "name", "sortOrder"].includes(field))
          extra.push(`${key}.${field}`);
      }
    }
  }
  return extra;
}

function personRow(side: Side, extra: Doc): Doc {
  return {
    ...(fill(tables.people!.validator.json, "", side) as Doc),
    tenantId: side.tenant,
    ...extra,
  };
}

/**
 * The seeded staff profile gets its own sign-in, so the owner sign-in that
 * "@sign-in" fields name stays one live person (see makeWorld).
 */
function seedRow(table: string, side: Side): Doc {
  const doc = fill(tables[table]!.validator.json, "", side) as Doc;
  doc.tenantId = side.tenant;
  if (table === "people") doc.authSubjectId = `matrix-seeded-${side.tenant}`;
  return doc;
}

/** One record per workspace table; links resolved to this workspace's records. */
async function seedSide(t: Harness, side: Side): Promise<string[]> {
  const failed: string[] = [];
  for (const table of tenantTables) {
    const doc = seedRow(table, side);
    try {
      const id = await t.run((ctx) =>
        ctx.db.insert(table as never, doc as never),
      );
      side.seeded.set(table, id as string);
    } catch (error) {
      failed.push(`${table}: ${String(error).split("\n")[0]}`);
    }
  }
  // Second pass: every link now points at this workspace's own records.
  for (const [table, id] of side.seeded) {
    const doc = seedRow(table, side);
    // Keep the seeded area switch on, so the probes are not all stopped by it.
    if (table === "organizationCapabilitySettings") doc.enabled = true;
    try {
      await t.run((ctx) => ctx.db.replace(id as never, doc as never));
    } catch (error) {
      failed.push(`${table} links: ${String(error).split("\n")[0]}`);
    }
  }
  return failed;
}

/**
 * Workspace B always; workspace A only when `withA`. Record ids come from one
 * running counter, so the copy without A still creates A's records and then
 * deletes them: every later id matches between the copies, and A's ids point
 * at nothing (rather than at a record some later call made).
 */
export async function makeWorld(withA: boolean) {
  const t = convexTest(schema, modules);
  const b: Side = { tenant: TENANT_B, seeded: new Map() };
  const a: Side = { tenant: TENANT_A, seeded: new Map() };
  const failed = await seedSide(t, b);
  for (const role of ROLES) {
    await t.run((ctx) =>
      ctx.db.insert(
        "people" as never,
        personRow(b, {
          authSubjectId: `matrix-${role}-b`,
          role,
          status: "active",
        }) as never,
      ),
    );
  }
  {
    failed.push(...(await seedSide(t, a)));
    await t.run(async (ctx) => {
      // A removed staff profile, still linked to a sign-in.
      await ctx.db.insert(
        "people" as never,
        personRow(a, {
          authSubjectId: "matrix-removed-a",
          role: "owner",
          status: "inactive",
        }) as never,
      );
      await ctx.db.insert(
        "people" as never,
        personRow(a, {
          authSubjectId: "matrix-owner-a",
          role: "owner",
          status: "active",
        }) as never,
      );
    });
  }
  if (!withA) {
    await t.run(async (ctx) => {
      for (const table of tenantTables) {
        for (const row of (await ctx.db
          .query(table as never)
          .collect()) as Doc[]) {
          if (row.tenantId !== TENANT_A) continue;
          // The removed caller's own staff profile is part of the caller, not
          // workspace A data: both copies must see the same caller, or the
          // copy without A would answer as a claims-only sign-in instead.
          if (
            table === "people" &&
            (row as Doc).authSubjectId === "matrix-removed-a"
          ) {
            continue;
          }
          await ctx.db.delete(row._id as never);
        }
      }
    });
  }
  return { t, a, b, failed };
}

export type Caller = { label: string; identity: Doc | null };

export const OUTSIDERS: Caller[] = [
  ...ROLES.map((role) => ({
    label: `workspace B ${role}`,
    identity: {
      subject: `matrix-${role}-b`,
      tokenIdentifier: `matrix|${role}-b`,
      tenantId: TENANT_B,
    },
  })),
  {
    label: "workspace B owner sign-in with no staff profile",
    identity: {
      subject: "matrix-unlinked-b",
      tokenIdentifier: "matrix|unlinked-b",
      role: "owner",
      tenantId: TENANT_B,
    },
  },
  { label: "signed out", identity: null },
  {
    label: "removed person of workspace A",
    // Still carries workspace A's owner claims, as a removed Clerk
    // organization member does: the removal must win over the claims.
    identity: {
      subject: "matrix-removed-a",
      tokenIdentifier: "matrix|removed-a",
      role: "org:owner",
      tenantId: TENANT_A,
    },
  },
];

export const OWNER_A: Caller = {
  label: "workspace A owner",
  identity: {
    subject: "matrix-owner-a",
    tokenIdentifier: "matrix|owner-a",
    role: "owner",
    tenantId: TENANT_A,
  },
};

export function as(t: Harness, caller: Caller): Harness {
  return caller.identity
    ? (t.withIdentity(caller.identity as never) as Harness)
    : t;
}

export type Outcome = { value: unknown } | { error: string };

// The probes only await promises, so the worker never reaches its message
// queue on its own; after a minute the test runner's own calls time out
// ("Timeout calling onTaskUpdate") and fail the run though every test
// passed. Hand the queue a turn about once a second.
let lastBreak = performance.now();

export async function run(
  h: Harness,
  entry: Entry,
  args: Doc,
): Promise<Outcome> {
  if (performance.now() - lastBreak > 1000) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    lastBreak = performance.now();
  }
  try {
    const value =
      entry.kind === "query"
        ? await h.query(makeFunctionReference<"query">(entry.path), args)
        : await h.mutation(makeFunctionReference<"mutation">(entry.path), args);
    return { value };
  } catch (error) {
    return { error: String(error).split("\n")[0]! };
  }
}

export function show(outcome: Outcome): string {
  return "value" in outcome
    ? `value ${JSON.stringify(outcome.value, (_k, v: unknown) =>
        typeof v === "bigint"
          ? `${v}n`
          : v instanceof ArrayBuffer
            ? "bytes"
            : v,
      )}`
    : `error ${outcome.error}`;
}

/** Workspace A's records as one comparable text. */
export async function stateOfA(t: Harness): Promise<Map<string, string>> {
  const snap = new Map<string, string>();
  const rows = await t.run(async (ctx) => {
    const all: Doc[] = [];
    for (const table of tenantTables) {
      all.push(...((await ctx.db.query(table as never).collect()) as Doc[]));
    }
    return all;
  });
  for (const row of rows) {
    if (row.tenantId !== TENANT_A) continue;
    snap.set(String(row._id), show({ value: row }));
  }
  return snap;
}

export function changes(
  before: Map<string, string>,
  after: Map<string, string>,
) {
  const out: string[] = [];
  for (const [id, row] of after) {
    if (!before.has(id)) out.push(`added ${id}`);
    else if (before.get(id) !== row) out.push(`changed ${id}`);
  }
  for (const id of before.keys()) if (!after.has(id)) out.push(`removed ${id}`);
  return out;
}

export type Ledger = {
  reads: Record<string, string>;
  writes: Record<string, string>;
};

type World = Awaited<ReturnType<typeof makeWorld>>;

/** Answer text with both workspaces' seeded record ids replaced by <id>. */
function plainFor(world: World) {
  const ids = [...world.a.seeded.values(), ...world.b.seeded.values()];
  return (text: string) =>
    ids.reduce((out, id) => out.split(id).join("<id>"), text).slice(0, 300);
}

/**
 * Each shard prints each step so a full run does not look stopped while it
 * runs (#406). Date is faked, so time the steps with the real clock.
 */
function progressLog(shard: string) {
  const started = performance.now();
  return (step: string) =>
    console.log(
      `matrix progress ${shard} (${Math.round((performance.now() - started) / 1000)}s): ${step}`,
    );
}

/**
 * Reads: the same call by the same caller gets the same answer with and
 * without workspace A's records. A read changes nothing, so the callers
 * share one pair of copies.
 */
export async function checkReads(callers: Caller[], shard: string) {
  const full = await makeWorld(true);
  const empty = await makeWorld(false);
  const failed = [...full.failed, ...empty.failed];
  const a = full.a;
  const plain = plainFor(full);
  const entries = await publicFunctions();
  // Every link-like argument or record field must be aimed at workspace A.
  const unreadable = unreadableLinkNames(entries);
  const queries = entries.filter((e) => e.kind === "query");
  const progress = progressLog(shard);
  const readLeaks: string[] = [];
  let readProbes = 0;
  for (const caller of callers) {
    const withA = as(full.t, caller);
    const withoutA = as(empty.t, caller);
    for (const entry of queries) {
      for (const extra of variants(entry)) {
        const args = argsFor(entry, a, extra);
        const r1 = await run(withA, entry, args);
        readProbes += 1;
        const where = `${caller.label} -> ${entry.path}${extra ? ` [${extra}]` : ""}`;
        if (entry.path === PUBLIC_QUOTE_FORM) {
          // Open to anyone, so also: only option names, never more.
          const extraFields =
            "value" in r1 ? publicQuoteFormExtras(r1.value) : [];
          if (extraFields.length > 0)
            readLeaks.push(`${where} (${extraFields.join(", ")})`);
        }
        const r0 = await run(withoutA, entry, args);
        if (show(r1) !== show(r0))
          readLeaks.push(
            `${where}: with A ${plain(show(r1))} | without A ${plain(show(r0))}`,
          );
      }
    }
    progress(`reads checked for ${caller.label}`);
  }
  console.log(
    `matrix ${shard}: ${tenantTables.length} tables; ${queries.length} reads; ${readProbes} outside read probes`,
  );
  return { failed, unreadable, readLeaks, readProbes };
}

/**
 * Writes: no outside call changes, removes or adds a workspace A record,
 * checked right after each accepted call and again after each function (a
 * refused call is rolled back whole). The same call also runs in the copy
 * without workspace A, and must get the same answer there, so a refusal
 * cannot tell "exists in A" from "does not exist". Each caller gets its own
 * new pair of copies, so its result does not depend on which callers ran
 * before it or in which shard it runs.
 */
export async function checkWrites(callers: Caller[], shard: string) {
  const entries = await publicFunctions();
  const unreadable = unreadableLinkNames(entries);
  const mutations = entries.filter((e) => e.kind === "mutation");
  const progress = progressLog(shard);
  const idPattern = new RegExp(
    `\\d{2,}(?:${Object.keys(tables)
      .sort((x, y) => y.length - x.length)
      .join("|")})`,
    "g",
  );
  // Ids of records made by the calls, and one-time upload tokens.
  const noIds = (text: string) =>
    text.replace(idPattern, "<id>").replace(/token=[\d.]+/g, "token=<t>");
  const failed: string[] = [];
  const writeLeaks: string[] = [];
  let writeProbes = 0;
  for (const caller of callers) {
    const full = await makeWorld(true);
    const empty = await makeWorld(false);
    failed.push(...full.failed, ...empty.failed);
    const a = full.a;
    const plain = plainFor(full);
    let current = await stateOfA(full.t);
    const noteChanges = (where: string) =>
      stateOfA(full.t).then((next) => {
        for (const change of changes(current, next))
          writeLeaks.push(`${where}: ${change}`);
        current = next;
      });
    const withA = as(full.t, caller);
    const withoutA = as(empty.t, caller);
    for (const entry of mutations) {
      for (const extra of variants(entry)) {
        const args = argsFor(entry, a, extra, true);
        const where = `${caller.label} -> ${entry.path}${extra ? ` [${extra}]` : ""}`;
        const w1 = await run(withA, entry, args);
        const w0 = await run(withoutA, entry, args);
        writeProbes += 1;
        if ("value" in w1) await noteChanges(where);
        if (
          !ANSWER_MAY_DIFFER[entry.path] &&
          noIds(show(w1)) !== noIds(show(w0))
        )
          writeLeaks.push(
            `${where}: with A ${plain(noIds(show(w1)))} | without A ${plain(noIds(show(w0)))}`,
          );
      }
      await noteChanges(`${caller.label} -> ${entry.path}`);
    }
    progress(`writes checked for ${caller.label}`);
  }
  console.log(
    `matrix ${shard}: ${tenantTables.length} tables; ${mutations.length} writes; ${writeProbes} outside write probes`,
  );
  return { failed, unreadable, writeLeaks, writeProbes };
}

function reached(map: Record<string, string>) {
  return Object.values(map).filter((r) => !r.startsWith("no owner")).length;
}

/** Ledger: does each read find workspace A's records for A's own owner? */
export async function ownerReadLedger() {
  const full = await makeWorld(true);
  const empty = await makeWorld(false);
  const failed = [...full.failed, ...empty.failed];
  const a = full.a;
  const plain = plainFor(full);
  const queries = (await publicFunctions()).filter((e) => e.kind === "query");
  const reads: Record<string, string> = {};
  const ownerWith = as(full.t, OWNER_A);
  const ownerWithout = as(empty.t, OWNER_A);
  for (const entry of queries) {
    let reason = "";
    for (const extra of variants(entry)) {
      const args = argsFor(entry, a, extra);
      const r1 = await run(ownerWith, entry, args);
      const r0 = await run(ownerWithout, entry, args);
      if ("value" in r1 && show(r1) !== show(r0)) {
        reason = `reaches workspace A records${extra ? ` via ${extra}` : ""}`;
        break;
      }
      reason ||=
        "error" in r1
          ? `no owner reach: ${plain(r1.error)}`
          : "no owner reach: same answer with or without workspace A records";
    }
    reads[entry.path] = reason;
  }
  console.log(
    `matrix owner reads: ${queries.length} reads (${reached(reads)} reach A for its owner)`,
  );
  return { failed, reads };
}

/** Ledger: does each write change workspace A records for A's own owner? */
export async function ownerWriteLedger() {
  const own = await makeWorld(true);
  const mutations = (await publicFunctions()).filter(
    (e) => e.kind === "mutation",
  );
  const writes: Record<string, string> = {};
  const owner = as(own.t, OWNER_A);
  let ownState = await stateOfA(own.t);
  for (const entry of mutations) {
    let reason = "";
    for (const extra of variants(entry)) {
      const out = await run(owner, entry, argsFor(entry, own.a, extra));
      if ("value" in out) {
        const next = await stateOfA(own.t);
        const changed = changes(ownState, next).length > 0;
        ownState = next;
        if (changed) {
          reason = `changes workspace A records${extra ? ` via ${extra}` : ""}`;
          break;
        }
        reason ||= "no owner change: ran without changing workspace A records";
      } else {
        const ownIds = [...own.a.seeded.values(), ...own.b.seeded.values()];
        const text = ownIds.reduce(
          (s, id) => s.split(id).join("<id>"),
          out.error,
        );
        reason ||= `no owner change: ${text.slice(0, 300)}`;
      }
    }
    writes[entry.path] = reason;
  }
  console.log(
    `matrix owner writes: ${mutations.length} writes (${reached(writes)} change A for its owner)`,
  );
  return { failed: own.failed, writes };
}

/**
 * Compares one half of the ledger with tenant-access-matrix.ledger.json: a
 * read or write the file records as reaching must keep reaching. Refreshes
 * this half (and keeps the other half) with UPDATE_MATRIX_LEDGER=1, or when
 * the file or this half is missing or empty.
 */
export function compareLedgerHalf(
  kind: keyof Ledger,
  now: Record<string, string>,
): string[] {
  const load = (): Partial<Ledger> =>
    existsSync(LEDGER_PATH) && readFileSync(LEDGER_PATH, "utf8").trim() !== ""
      ? (JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Partial<Ledger>)
      : {};
  if (process.env.UPDATE_MATRIX_LEDGER || !load()[kind]) {
    const sorted = (m: Record<string, string>) =>
      Object.fromEntries(
        Object.entries(m).sort(([x], [y]) => x.localeCompare(y)),
      );
    // The other half belongs to the other ledger shard: keep it as it is.
    const file = load();
    const out: Partial<Ledger> = {};
    for (const half of ["reads", "writes"] as const) {
      const map = half === kind ? now : file[half];
      if (map) out[half] = sorted(map);
    }
    writeFileSync(LEDGER_PATH, `${JSON.stringify(out, null, 2)}\n`);
  }
  const committed = load()[kind] ?? {};
  const lostReach: string[] = [];
  for (const [path, reason] of Object.entries(committed)) {
    const current = now[path];
    // A removed function drops out; a kept one must keep reaching.
    if (
      current &&
      !reason.startsWith("no owner") &&
      current.startsWith("no owner")
    )
      lostReach.push(`${kind} ${path}: was "${reason}", now "${current}"`);
  }
  return lostReach;
}

/**
 * Outside writes run in this many files, tenant-access-matrix.writes-1 ..
 * writes-N. Callers go round-robin, so every caller lands in exactly one.
 */
export const WRITE_SHARDS = 9;

export function writeShardCallers(shard: number): Caller[] {
  return OUTSIDERS.filter((_, k) => k % WRITE_SHARDS === shard - 1);
}
