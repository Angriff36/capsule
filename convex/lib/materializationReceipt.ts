import type { MutationCtx } from "../_generated/server";

const requestKey = (tenantId: string, family: string, operationKey: string) =>
  `${tenantId}:safeMaterialization:${family}:${operationKey}`;
const scopeOf = (operationKey: string) =>
  operationKey.slice(0, operationKey.lastIndexOf(":"));
const headKey = (tenantId: string, family: string, operationKey: string) =>
  `${tenantId}:safeMaterialization:${family}:head:${scopeOf(operationKey)}`;

export async function readMaterializationReceipt<T>(
  ctx: MutationCtx,
  tenantId: string,
  family: string,
  operationKey: string,
  payload: unknown,
): Promise<T | undefined> {
  const exact = await ctx.db
    .query("commandIdempotencyKeys")
    .withIndex("by_key", (q) =>
      q.eq("key", requestKey(tenantId, family, operationKey)),
    )
    .first();
  if (exact) return (exact.result as { output: T }).output;

  if (!operationKey.endsWith(":storage-unavailable")) return undefined;
  const head = await ctx.db
    .query("commandIdempotencyKeys")
    .withIndex("by_key", (q) =>
      q.eq("key", headKey(tenantId, family, operationKey)),
    )
    .first();
  if (!head) return undefined;
  return (head.result as { output: T }).output;
}

export async function writeMaterializationReceipt<T>(
  ctx: MutationCtx,
  tenantId: string,
  family: string,
  operationKey: string,
  payload: unknown,
  output: T,
): Promise<void> {
  await ctx.db.insert("commandIdempotencyKeys", {
    key: requestKey(tenantId, family, operationKey),
    command: "safeMaterialization",
    result: { payload: JSON.stringify(payload), output },
    createdAt: Date.now(),
  });
  const key = headKey(tenantId, family, operationKey);
  const head = await ctx.db
    .query("commandIdempotencyKeys")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  const result = { operationKey, output };
  if (head) await ctx.db.patch(head._id, { result, createdAt: Date.now() });
  else
    await ctx.db.insert("commandIdempotencyKeys", {
      key,
      command: "safeMaterializationHead",
      result,
      createdAt: Date.now(),
    });
}
