/** Preview/apply explicit source-reviewed fluid-ounce packing corrections. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { CapsuleAgentAuthManager } from "../src/agent/CapsuleAgentAuthManager";

const { values } = parseArgs({
  options: {
    source: { type: "string" },
    snapshot: { type: "string" },
    out: { type: "string", default: ".artifacts/tpp-packing-unit-repair" },
    apply: { type: "boolean", default: false },
    "expected-plan-sha256": { type: "string" },
    url: { type: "string" },
    tenant: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Usage: bun scripts/repair-tpp-packing-units.ts --source <reviewed.json> --snapshot <packing.json> [--out <directory>]\nPreview is the default. Apply adds --apply --expected-plan-sha256 <hash> --url <Convex URL> --tenant <tenant ID>. Authentication uses the existing Capsule agent session. A source selects one pack list and explicit item IDs, descriptions, original fluid-ounce quantities, and source references.",
  );
  process.exit(0);
}
if (!values.source || !values.snapshot)
  throw new Error("Provide --source and --snapshot; use --help for usage");
const read = (path: string) =>
  readFileSync(path, "utf8").replace(/^\uFEFF/, "");
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const sourceText = read(values.source),
  snapshotText = read(values.snapshot);
const source = JSON.parse(sourceText),
  snapshot = JSON.parse(snapshotText);
if (
  typeof source.packListId !== "string" ||
  !Array.isArray(source.items) ||
  !source.items.length
)
  throw new Error("Source requires packListId and at least one reviewed item");
if (
  !["PackList", "PackListItem", "Event"].every((key) =>
    Array.isArray(snapshot[key]),
  )
)
  throw new Error("Snapshot requires PackList, PackListItem and Event arrays");
const list = snapshot.PackList.find(
  (row: any) => row._id === source.packListId && row.deletedAt == null,
);
const event = snapshot.Event.find(
  (row: any) =>
    row._id === list?.eventId &&
    row.tenantId === list?.tenantId &&
    row.deletedAt == null,
);
if (!list || !event)
  throw new Error("Source pack list and its event must exist in the snapshot");
if (
  ["dispatched", "cancelled"].includes(list.status) ||
  ["completed", "closed_out", "cancelled"].includes(event.stage)
)
  throw new Error("Historical packing records must remain unchanged");
const seen = new Set<string>();
const plan = source.items.map((input: any) => {
  if (
    typeof input.itemId !== "string" ||
    seen.has(input.itemId) ||
    typeof input.description !== "string" ||
    !input.description.trim() ||
    typeof input.sourceReference !== "string" ||
    !input.sourceReference.trim() ||
    !Number.isFinite(input.sourceFluidOunces) ||
    input.sourceFluidOunces < 0
  )
    throw new Error(
      "Each source item requires a unique ID, description, nonnegative fluid ounces and source reference",
    );
  seen.add(input.itemId);
  const item = snapshot.PackListItem.find(
    (row: any) =>
      row._id === input.itemId &&
      row.packListId === list._id &&
      row.tenantId === list.tenantId &&
      row.deletedAt == null,
  );
  if (!item || item.description !== input.description)
    throw new Error(`Packing identity changed: ${input.itemId}`);
  const corrected =
    item.unit === "cup" && item.unitCorrectionSource === input.sourceReference;
  if (
    !corrected &&
    (item.unit !== "ounce" ||
      item.unitCorrectionSource != null ||
      item.dishContainerId != null ||
      item.followsDishServings === true ||
      item.requiredQuantity !== input.sourceFluidOunces)
  )
    throw new Error(
      `Packing quantity or source relationship needs fresh review: ${input.description}`,
    );
  if (
    !Number.isInteger(item.version) ||
    !Number.isFinite(item.packedQuantity) ||
    item.packedQuantity < 0 ||
    !Number.isFinite(item.requiredQuantity) ||
    item.requiredQuantity < 0
  )
    throw new Error(`Invalid packing quantities/version: ${input.description}`);
  return {
    itemId: item._id,
    expectedVersion: item.version,
    sourceReference: input.sourceReference,
    description: item.description,
    alreadyCorrected: corrected,
    before: {
      requiredQuantity: item.requiredQuantity,
      packedQuantity: item.packedQuantity,
      unit: item.unit,
    },
    after: {
      requiredQuantity: corrected
        ? item.requiredQuantity
        : item.requiredQuantity / 8,
      packedQuantity: corrected ? item.packedQuantity : item.packedQuantity / 8,
      unit: "cup",
    },
    preserved: {
      status: item.status,
      listedAt: item.listedAt,
      packedAt: item.packedAt,
      missingAt: item.missingAt,
      dishId: item.dishId,
      eventDishId: item.eventDishId,
    },
  };
});
if (!Number.isInteger(list.version) || typeof list.tenantId !== "string")
  throw new Error("Invalid pack list version/tenant");
const args = {
  packListId: list._id,
  expectedVersion: list.version,
  items: plan.map(({ itemId, expectedVersion, sourceReference }: any) => ({
    itemId,
    expectedVersion,
    sourceReference,
  })),
};
const document = {
  sourcePath: values.source,
  sourceSha256: hash(sourceText),
  snapshotSha256: hash(snapshotText),
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
    pending: plan.filter((row: any) => !row.alreadyCorrected).length,
    planHash,
    out: values.out,
  }),
);
if (!values.apply) process.exit(0);
if (values["expected-plan-sha256"] !== planHash)
  throw new Error("Repair plan differs from the reviewed plan hash");
if (!values.url || !values.tenant || values.tenant !== list.tenantId)
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
const result = await client.mutation(
  "lib/culinaryOperations:reconcileImportedPackingFluidOunces" as any,
  args,
);
// Save acknowledgement before readback: a failed read must not conceal a write.
writeFileSync(
  `${values.out}/receipt.json`,
  JSON.stringify({ planHash, result, verification: "pending" }, null, 2),
);
const actual = await Promise.all(
  plan.map((item: any) =>
    client.query("queries:getPackListItem" as any, { id: item.itemId }),
  ),
);
writeFileSync(
  `${values.out}/receipt.json`,
  JSON.stringify(
    { planHash, result, actual, verification: "readback captured" },
    null,
    2,
  ),
);
for (let index = 0; index < plan.length; index++) {
  const expected = plan[index],
    row = actual[index];
  if (
    !row ||
    row.unit !== "cup" ||
    row.unitCorrectionSource !== expected.sourceReference ||
    row.requiredQuantity !== expected.after.requiredQuantity ||
    row.packedQuantity !== expected.after.packedQuantity ||
    Object.entries(expected.preserved).some(
      ([key, value]) => row[key] !== value,
    )
  )
    throw new Error(
      "Repair was acknowledged but readback differs from the reviewed result; inspect receipt.json before further action",
    );
}
writeFileSync(
  `${values.out}/receipt.json`,
  JSON.stringify({ planHash, result, actual, verification: "passed" }, null, 2),
);
console.log(
  JSON.stringify({ mode: "applied", result, verification: "passed" }),
);
