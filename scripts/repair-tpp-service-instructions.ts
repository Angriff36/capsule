/**
 * Preview or execute source-reviewed event service instructions for existing dishes.
 *
 * The command writes only the new Dish service fields through the generated
 * command contract. Recipe preparation text and all related operational rows
 * remain untouched. Preview is the default; apply requires the reviewed plan
 * hash, target tenant, and a live Convex URL.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { CapsuleAgentAuthManager } from "../src/agent/CapsuleAgentAuthManager";

const { values } = parseArgs({
  options: {
    help: { type: "boolean", short: "h", default: false },
    source: { type: "string" },
    snapshot: { type: "string" },
    out: {
      type: "string",
      default: ".artifacts/tpp-service-instruction-repair",
    },
    capture: { type: "boolean", default: false },
    apply: { type: "boolean", default: false },
    "expected-plan-sha256": { type: "string" },
    url: { type: "string" },
    tenant: { type: "string" },
  },
});

if (values.help) {
  console.log(
    "Usage: bun scripts/repair-tpp-service-instructions.ts --source <source-comparison.json> --snapshot <dish-snapshot.json> [--out <directory>]\nPreview is the default. Capture a fresh snapshot with --capture --url <Convex URL> --tenant <tenant ID>. Apply a reviewed preview with --apply --expected-plan-sha256 <hash> --url <Convex URL> --tenant <tenant ID>. Authentication uses the existing Capsule agent session.",
  );
  process.exit(0);
}

const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const normalizeTargetUrl = (value: string) => {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/+$/, "");
};
const parseJson = (bytes: Buffer) =>
  JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
const auth = new CapsuleAgentAuthManager();

const validateTenantJwt = (jwt: string, tenant: string) => {
  const payload = jwt.split(".")[1];
  if (!payload) throw new Error("Authenticated repair token is malformed");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  if ((claims.tenantId ?? claims.org_id ?? claims.o?.id) !== tenant)
    throw new Error("Authenticated tenant differs from repair target");
};

if (values.capture) {
  if (!values.url || !values.tenant)
    throw new Error("Capture requires --url and --tenant");
  const jwt = await auth.resolveJwt();
  const client = new ConvexHttpClient(values.url);
  client.setAuth(jwt);
  const dishes = await client.query(api.queries.listDish, {});
  if (dishes.some((dish: any) => dish.tenantId !== values.tenant))
    throw new Error("Captured dishes contain a different tenant");
  mkdirSync(values.out, { recursive: true });
  const document = {
    capturedAt: new Date().toISOString(),
    targetUrl: values.url,
    tenantId: values.tenant,
    Dish: dishes,
  };
  const bytes = JSON.stringify(document, null, 2);
  writeFileSync(`${values.out}/snapshot.json`, bytes);
  writeFileSync(`${values.out}/snapshot.sha256`, hash(bytes));
  console.log(
    JSON.stringify(
      { mode: "capture", tenant: values.tenant, dishes: dishes.length },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (!values.source || !values.snapshot)
  throw new Error(
    "Provide --source and --snapshot, or use --capture; use --help for usage",
  );

const sourceBytes = readFileSync(values.source);
const snapshotBytes = readFileSync(values.snapshot);
const source = parseJson(sourceBytes);
const snapshot = parseJson(snapshotBytes);
if (!Array.isArray(source) || !Array.isArray(snapshot.Dish))
  throw new Error("Source must be an array and snapshot must contain Dish[]");

const supported = source.filter(
  (row: any) =>
    typeof row?.method?.instructions === "string" &&
    row.method.instructions.trim(),
);
const unsupported = source
  .filter(
    (row: any) =>
      typeof row?.method?.instructions !== "string" ||
      !row.method.instructions.trim(),
  )
  .map((row: any) => row.name);
const seen = new Set<string>();
const planEntries = supported.map((row: any) => {
  if (
    typeof row.dishId !== "string" ||
    !row.dishId.trim() ||
    seen.has(row.dishId) ||
    typeof row.method.instructionsCell !== "string" ||
    !row.method.instructionsCell.trim()
  )
    throw new Error(
      `Service source row needs a unique dish id and cell: ${row.name}`,
    );
  seen.add(row.dishId);
  const dish = snapshot.Dish.find(
    (candidate: any) => candidate._id === row.dishId,
  );
  if (!dish || dish.deletedAt != null || dish.status !== "active")
    throw new Error(`Active dish is missing from the snapshot: ${row.name}`);
  if (typeof dish.version !== "number")
    throw new Error(`Dish version is missing from the snapshot: ${row.name}`);
  const sourceName = String(row.name ?? "").trim();
  const dishName = String(dish.name ?? "").trim();
  if (!sourceName || dishName !== sourceName)
    throw new Error(
      `Source dish name does not match snapshot dish: ${sourceName} -> ${dishName}`,
    );
  const instructions = row.method.instructions.trim();
  const serviceInstructions = String(dish.serviceInstructions ?? "").trim();
  const serviceSource = String(dish.serviceInstructionsSource ?? "").trim();
  const sourceReference = `Heating_and_Serving_Event_Menu.xlsx sheet1 ${row.method.instructionsCell}`;
  if (serviceInstructions && serviceInstructions !== instructions)
    throw new Error(
      `Existing service instructions differ from source review: ${row.name}`,
    );
  if (serviceSource && serviceSource !== sourceReference)
    throw new Error(
      `Existing service source differs from source review: ${row.name}`,
    );
  return {
    dishId: row.dishId,
    name: row.name,
    dishName,
    sourceRow: row.method.sourceRow,
    instructionsCell: row.method.instructionsCell,
    instructions,
    sourceReference,
    expectedVersion: dish.version,
    expectedRecipeInstructionsSha256: hash(
      String(dish.recipeInstructions ?? ""),
    ),
    status:
      serviceInstructions === instructions && serviceSource === sourceReference
        ? "already-applied"
        : "pending",
  };
});

const document = {
  sourceSha256: hash(sourceBytes),
  snapshotSha256: hash(snapshotBytes),
  targetUrl:
    typeof snapshot.targetUrl === "string"
      ? normalizeTargetUrl(snapshot.targetUrl)
      : null,
  tenantId:
    values.tenant ?? snapshot.tenantId ?? snapshot.Dish[0]?.tenantId ?? null,
  supportedCount: supported.length,
  unsupported,
  entries: planEntries,
};
if (!document.tenantId || typeof document.tenantId !== "string")
  throw new Error("Plan requires --tenant or snapshot.tenantId");
if (snapshot.Dish.some((dish: any) => dish.tenantId !== document.tenantId))
  throw new Error("Snapshot contains a different tenant");

const planHash = hash(JSON.stringify(document));
mkdirSync(values.out, { recursive: true });
const receiptPath = `${values.out}/receipt.json`;
writeFileSync(`${values.out}/plan.json`, JSON.stringify(document, null, 2));
writeFileSync(`${values.out}/plan.sha256`, planHash);
console.log(
  JSON.stringify(
    {
      mode: values.apply ? "apply" : "preview",
      planSha256: planHash,
      tenant: document.tenantId,
      supported: supported.length,
      unsupported,
      pending: planEntries.filter((entry) => entry.status === "pending").length,
      alreadyApplied: planEntries.filter(
        (entry) => entry.status === "already-applied",
      ).length,
    },
    null,
    2,
  ),
);
if (!values.apply) process.exit(0);
if (values["expected-plan-sha256"] !== planHash)
  throw new Error("Repair plan differs from the reviewed plan hash");
if (!values.url || !values.tenant)
  throw new Error("Apply requires --url and --tenant");
if (values.tenant !== document.tenantId)
  throw new Error("Authenticated repair tenant differs from the reviewed plan");
if (!document.targetUrl)
  throw new Error("Reviewed snapshot is missing its target Convex URL");
if (normalizeTargetUrl(values.url) !== document.targetUrl)
  throw new Error("Apply URL differs from the reviewed backend URL");

// Validate authentication before replacing any prior receipt. A rejected apply
// must not erase the evidence from an earlier acknowledged attempt.
const initialJwt = await auth.resolveJwt();
validateTenantJwt(initialJwt, values.tenant);
const client = new ConvexHttpClient(values.url);
client.setAuth(initialJwt);
const receipts: Array<Record<string, unknown>> = [];
let receiptStarted = false;
const writeReceipt = () =>
  writeFileSync(
    receiptPath,
    JSON.stringify(
      { planSha256: planHash, tenantId: document.tenantId, entries: receipts },
      null,
      2,
    ),
  );
const startReceipt = () => {
  if (receiptStarted) return;
  // Keep the prior receipt until an authenticated backend read succeeds. An
  // expired token or unavailable backend must not erase recovery evidence.
  try {
    unlinkSync(receiptPath);
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
  receiptStarted = true;
  writeReceipt();
};
for (const entry of planEntries) {
  const jwt = await auth.resolveJwt();
  validateTenantJwt(jwt, values.tenant);
  client.setAuth(jwt);
  const current: any = await client.query(api.queries.getDish, {
    id: entry.dishId as any,
  });
  if (
    !current ||
    current.tenantId !== values.tenant ||
    current.deletedAt != null
  )
    throw new Error(`Dish disappeared or crossed tenants: ${entry.name}`);
  startReceipt();
  const currentInstructions = String(current.serviceInstructions ?? "").trim();
  const currentSource = String(current.serviceInstructionsSource ?? "").trim();
  if (
    currentInstructions === entry.instructions &&
    currentSource === entry.sourceReference
  ) {
    receipts.push({
      ...entry,
      result: "already-applied",
      version: current.version,
    });
    writeReceipt();
    continue;
  }
  if (
    current.version !== entry.expectedVersion ||
    currentInstructions ||
    currentSource ||
    hash(String(current.recipeInstructions ?? "")) !==
      entry.expectedRecipeInstructionsSha256
  )
    throw new Error(
      `Dish changed after review; refresh the snapshot: ${entry.name}`,
    );
  const receiptIndex =
    receipts.push({
      ...entry,
      result: "mutation-pending",
    }) - 1;
  writeReceipt();
  let mutationResult: unknown;
  try {
    // Do not pass idempotencyKey: the generated wrapper checks its cache before
    // authentication. Version and current-state checks make this repair safe
    // to retry without exposing its result through that cache.
    mutationResult = await client.mutation(
      api.mutations.Dish_saveServiceInstructions,
      {
        docId: entry.dishId as any,
        instructions: entry.instructions,
        source: entry.sourceReference,
        version: entry.expectedVersion,
      },
    );
  } catch (error) {
    receipts[receiptIndex] = {
      ...receipts[receiptIndex],
      result: "mutation-not-acknowledged",
      error: error instanceof Error ? error.message : String(error),
    };
    writeReceipt();
    throw error;
  }
  receipts[receiptIndex] = {
    ...receipts[receiptIndex],
    result: "acknowledged-readback-pending",
    version: entry.expectedVersion + 1,
    mutationResult,
  };
  writeReceipt();
  try {
    const after: any = await client.query(api.queries.getDish, {
      id: entry.dishId as any,
    });
    if (
      !after ||
      after.serviceInstructions !== entry.instructions ||
      after.serviceInstructionsSource !== entry.sourceReference ||
      after.version !== entry.expectedVersion + 1 ||
      hash(String(after.recipeInstructions ?? "")) !==
        entry.expectedRecipeInstructionsSha256
    )
      throw new Error(`Readback verification failed: ${entry.name}`);
    receipts[receiptIndex] = {
      ...receipts[receiptIndex],
      result: "saved",
      version: after.version,
      after,
    };
    writeReceipt();
  } catch (error) {
    receipts[receiptIndex] = {
      ...receipts[receiptIndex],
      result: "acknowledged-readback-failed",
      error: error instanceof Error ? error.message : String(error),
    };
    writeReceipt();
    throw error;
  }
}
if (receiptStarted) writeReceipt();
console.log(
  JSON.stringify(
    {
      mode: "applied",
      saved: receipts.filter((receipt) => receipt.result === "saved").length,
      alreadyApplied: receipts.filter(
        (receipt) => receipt.result === "already-applied",
      ).length,
      verified: receipts.length,
    },
    null,
    2,
  ),
);
