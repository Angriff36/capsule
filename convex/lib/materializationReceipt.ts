import type { MutationCtx } from "../_generated/server";

const requestKey = (tenantId: string, family: string, operationKey: string) =>
  `${tenantId}:exact:${family}:${operationKey}`;
const scopeOf = (operationKey: string) =>
  operationKey.slice(0, operationKey.lastIndexOf(":"));
const headKey = (tenantId: string, family: string, operationKey: string) =>
  `${tenantId}:head:${family}:${scopeOf(operationKey)}`;

async function findReceipt(
  ctx: MutationCtx,
  tenantId: string,
  receiptKey: string,
) {
  return await ctx.db
    .query("materializationReceipts")
    .withIndex("by_receiptKey", (q) => q.eq("receiptKey", receiptKey))
    .filter((q) => q.eq(q.field("tenantId"), tenantId))
    .first();
}

export async function readMaterializationReceipt<T>(
  ctx: MutationCtx,
  tenantId: string,
  family: string,
  operationKey: string,
  _payload: unknown,
): Promise<T | undefined> {
  if (operationKey.endsWith(":storage-unavailable")) {
    const head = await findReceipt(
      ctx,
      tenantId,
      headKey(tenantId, family, operationKey),
    );
    if (head) return head.output as T;
  }
  const exact = await findReceipt(
    ctx,
    tenantId,
    requestKey(tenantId, family, operationKey),
  );
  if (exact) return exact.output as T;

  return undefined;
}

export async function writeMaterializationReceipt<T>(
  ctx: MutationCtx,
  tenantId: string,
  family: string,
  operationKey: string,
  _payload: unknown,
  output: T,
): Promise<void> {
  const now = Date.now();
  await ctx.db.insert("materializationReceipts", {
    tenantId,
    receiptKey: requestKey(tenantId, family, operationKey),
    family,
    operationKey,
    output,
    createdAt: now,
    updatedAt: now,
  });
  const key = headKey(tenantId, family, operationKey);
  const head = await findReceipt(ctx, tenantId, key);
  if (head)
    await ctx.db.patch(head._id, { operationKey, output, updatedAt: now });
  else
    await ctx.db.insert("materializationReceipts", {
      tenantId,
      receiptKey: key,
      family,
      operationKey,
      output,
      createdAt: now,
      updatedAt: now,
    });
}
