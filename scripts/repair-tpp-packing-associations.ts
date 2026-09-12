/** Execute a snapshot-bound, source-reviewed packing association plan. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { CapsuleAgentAuthManager } from "../src/agent/CapsuleAgentAuthManager";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    "Usage: bun scripts/repair-tpp-packing-associations.ts --source <reviewed.json> --snapshot <packing.json> [--out <directory>]\nPreview is offline and is the default. Apply adds --apply --expected-plan-sha256 <hash> --url <Convex URL> --tenant <tenant ID>. Authentication uses the existing Capsule agent session. Reuse the exact original inputs to recover an acknowledged or uncertain attempt; do not refresh versions for a retry. New source review requires a new operation key.",
  );
  process.exit(0);
}
const { values } = parseArgs({
  options: {
    source: { type: "string" },
    snapshot: { type: "string" },
    out: {
      type: "string",
      default: ".artifacts/tpp-packing-association-repair",
    },
    apply: { type: "boolean", default: false },
    "expected-plan-sha256": { type: "string" },
    url: { type: "string" },
    tenant: { type: "string" },
  },
});
if (!values.source || !values.snapshot)
  throw new Error("Provide --source and --snapshot; use --help for usage");
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const sourceBytes = readFileSync(values.source),
  snapshotBytes = readFileSync(values.snapshot);
const parse = (bytes: Buffer) =>
  JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
const source = parse(sourceBytes),
  snapshot = parse(snapshotBytes);
if (source.snapshotSha256 !== hash(snapshotBytes))
  throw new Error(
    "Snapshot differs from the source-reviewed snapshot; review changes before making a new plan",
  );
if (
  !["PackList", "PackListItem", "Event", "EventDish"].every((key) =>
    Array.isArray(snapshot[key]),
  )
)
  throw new Error(
    "Snapshot requires PackList, PackListItem, Event and EventDish arrays",
  );
const supplied = source.args;
if (
  !supplied ||
  typeof supplied.operationKey !== "string" ||
  !supplied.operationKey.trim() ||
  typeof supplied.packListId !== "string" ||
  !Array.isArray(supplied.links) ||
  !supplied.links.length
)
  throw new Error(
    "Source requires an operation key, pack list and reviewed links",
  );
const list = snapshot.PackList.find(
  (row: any) => row._id === supplied.packListId && row.deletedAt == null,
);
const event = snapshot.Event.find(
  (row: any) =>
    row._id === list?.eventId &&
    row.tenantId === list?.tenantId &&
    row.deletedAt == null,
);
if (!list || !event || typeof list.tenantId !== "string")
  throw new Error(
    "Source pack list and its event must exist in the same tenant",
  );
if (
  ["dispatched", "cancelled"].includes(list.status) ||
  ["completed", "closed_out", "cancelled"].includes(event.stage)
)
  throw new Error("Historical packing records must remain unchanged");
if (
  !Number.isInteger(supplied.expectedVersion) ||
  supplied.expectedVersion !== list.version ||
  !Number.isInteger(supplied.expectedEventVersion) ||
  supplied.expectedEventVersion !== event.version
)
  throw new Error("Pack list or event version differs from source review");
const seen = new Set<string>();
const plan = supplied.links.map((link: any) => {
  if (
    typeof link.itemId !== "string" ||
    seen.has(link.itemId) ||
    typeof link.eventDishId !== "string" ||
    typeof link.expectedDescription !== "string" ||
    typeof link.sourceReference !== "string" ||
    !link.sourceReference.trim()
  )
    throw new Error(
      "Each item requires one explicit identity, menu line, description and source reference",
    );
  seen.add(link.itemId);
  const item = snapshot.PackListItem.find(
    (row: any) =>
      row._id === link.itemId &&
      row.packListId === list._id &&
      row.tenantId === list.tenantId &&
      row.deletedAt == null,
  );
  const selection = snapshot.EventDish.find(
    (row: any) =>
      row._id === link.eventDishId &&
      row.eventId === event._id &&
      row.tenantId === list.tenantId &&
      row.deletedAt == null &&
      row.removedAt == null,
  );
  if (!item || !selection || typeof selection.dishId !== "string")
    throw new Error(
      `Packing item or active menu line not found: ${link.itemId}`,
    );
  if (
    !Number.isInteger(link.expectedVersion) ||
    item.version !== link.expectedVersion ||
    item.description !== link.expectedDescription ||
    !Number.isInteger(link.expectedEventDishVersion) ||
    selection.version !== link.expectedEventDishVersion
  )
    throw new Error(
      `Item or menu line differs from source review: ${link.itemId}`,
    );
  if (
    item.listedAt == null ||
    item.dishContainerId != null ||
    item.followsDishServings === true ||
    item.dishId != null ||
    item.eventDishId != null ||
    item.associationSource != null
  )
    throw new Error(
      `Packing item already has a relationship or is not a listed import: ${link.itemId}`,
    );
  return {
    itemId: item._id,
    before: item,
    after: {
      dishId: selection.dishId,
      eventDishId: selection._id,
      associationSource: link.sourceReference,
    },
  };
});
// Select only the command contract, preserving the reviewed versions for retries.
const args = {
  operationKey: supplied.operationKey,
  packListId: supplied.packListId,
  expectedVersion: supplied.expectedVersion,
  expectedEventVersion: supplied.expectedEventVersion,
  links: supplied.links.map((link: any) => ({
    itemId: link.itemId,
    expectedVersion: link.expectedVersion,
    expectedDescription: link.expectedDescription,
    eventDishId: link.eventDishId,
    expectedEventDishVersion: link.expectedEventDishVersion,
    sourceReference: link.sourceReference,
  })),
};
const document = {
  sourceSha256: hash(sourceBytes),
  snapshotSha256: hash(snapshotBytes),
  tenantId: list.tenantId,
  eventId: event._id,
  args,
  plan,
};
const planHash = hash(JSON.stringify(document));
mkdirSync(values.out, { recursive: true });
writeFileSync(`${values.out}/plan.json`, JSON.stringify(document, null, 2));
writeFileSync(`${values.out}/plan.sha256`, planHash);
console.log(
  JSON.stringify({
    mode: "preview",
    items: plan.length,
    planHash,
    out: values.out,
  }),
);
if (!values.apply) process.exit(0);
if (values["expected-plan-sha256"] !== planHash)
  throw new Error("Repair plan differs from the reviewed plan hash");
if (!values.url || values.tenant !== list.tenantId)
  throw new Error(
    "Apply requires explicit --url and --tenant matching the snapshot",
  );
const auth = new CapsuleAgentAuthManager();
const jwt = await auth.resolveJwt();
const claims = JSON.parse(
  Buffer.from(jwt.split(".")[1], "base64url").toString(),
);
if ((claims.tenantId ?? claims.org_id ?? claims.o?.id) !== values.tenant)
  throw new Error("Authenticated tenant differs from repair target");
const client = new ConvexHttpClient(values.url);
client.setAuth(jwt);
// Separate attempts retain prior acknowledgements even if a later read fails.
const receiptDirectory = `${values.out}/${planHash}`;
mkdirSync(receiptDirectory, { recursive: true });
const receiptPath = `${receiptDirectory}/attempt-${Date.now()}.json`;
const receipt: Record<string, unknown> = {
  planHash,
  operationKey: args.operationKey,
  url: values.url,
  tenantId: list.tenantId,
  verification: "mutation pending",
};
const saveReceipt = () =>
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
saveReceipt();
let result: { changed: number; recovered: boolean };
try {
  result = await client.mutation(
    "lib/culinaryOperations:reconcileImportedPackingAssociations" as any,
    args,
  );
} catch (error) {
  receipt.verification =
    "mutation not acknowledged; inspect error and replay exact inputs to resolve uncertain writes";
  saveReceipt();
  throw error;
}
receipt.result = result;
receipt.verification = "acknowledged; readback pending";
saveReceipt();
const actual = await Promise.all(
  plan.map((item: any) =>
    client.query("queries:getPackListItem" as any, { id: item.itemId }),
  ),
);
receipt.actual = actual;
receipt.verification = "readback captured";
saveReceipt();
const differences = plan.flatMap((expected: any, index: number) => {
  const row = actual[index];
  if (!row)
    return [{ itemId: expected.itemId, fields: ["record unavailable"] }];
  const preserved = [
    "_id",
    "packListId",
    "tenantId",
    "description",
    "requiredQuantity",
    "packedQuantity",
    "unit",
    "status",
    "listedAt",
    "packedAt",
    "missingAt",
    "dishContainerId",
    "followsDishServings",
    "unitCorrectionSource",
    "deletedAt",
    "createdAt",
  ];
  const fields = preserved.filter(
    (key) => (row[key] ?? null) !== (expected.before[key] ?? null),
  );
  fields.push(
    ...Object.keys(expected.after).filter(
      (key) => row[key] !== expected.after[key],
    ),
  );
  return fields.length ? [{ itemId: expected.itemId, fields }] : [];
});
receipt.differences = differences;
if (result.recovered) {
  // The original transaction is confirmed by its payload-bound server receipt.
  // Later staff edits are legitimate; current rows are evidence, not overwritten.
  receipt.verification =
    "original transaction recovered; current state captured";
} else if (differences.length || result.changed !== plan.length) {
  receipt.verification =
    "acknowledged; current state differs from reviewed result";
  saveReceipt();
  throw new Error(
    `Repair acknowledged but verification differs; inspect ${receiptPath} before further action`,
  );
} else {
  receipt.verification = "passed";
}
saveReceipt();
console.log(
  JSON.stringify({
    mode: result.recovered ? "recovered" : "applied",
    result,
    verification: receipt.verification,
    differences: differences.length,
    receiptPath,
  }),
);
