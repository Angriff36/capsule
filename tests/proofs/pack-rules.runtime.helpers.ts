/**
 * Shared harness for the pack-rule runtime proofs (PL-PACK-RULES): a planned
 * event, dishes, pack rules, and readers for the generated pack lines.
 * Assertion-free; each test file owns its expect() calls.
 */
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  liveRows,
  openPackList,
  readRow,
  rolesFor,
  runner,
  type Proof,
  type Role,
} from "./pack-quantity-override-survival.runtime.helpers";

export {
  createPlannedEvent,
  harness,
  liveRows,
  openPackList,
  readRow,
  rolesFor,
  runner,
};
export type { Proof, Role };

const M = api.mutations;

export type PackLine = {
  _id: string;
  packListId: string;
  description: string;
  unit: string;
  requiredQuantity: number;
  packedQuantity: number;
  packListTemplateId?: string | null;
  templateLineKey?: string | null;
  templateVersion?: number | null;
  generatedQuantity?: number | null;
  generationKey?: string | null;
  sourcesJson?: string | null;
  category?: string | null;
  ownership?: string | null;
  returnRequired?: boolean | null;
  returnNote?: string | null;
  requiredCapability?: boolean | null;
  followsDishServings?: boolean | null;
  retiredAt?: number | null;
  excludedAt?: number | null;
  status: string;
  version: number;
  tenantId: string;
  deletedAt?: number | null;
  serviceStyleKitItemId?: string | null;
};

export async function packLines(
  actor: Role,
  tenantId: string,
  packListId: string,
): Promise<PackLine[]> {
  const rows = await liveRows<PackLine>(actor, "packListItems", tenantId);
  return rows
    .filter((row) => row.packListId === packListId)
    .sort((a, b) => a.description.localeCompare(b.description));
}

export function line(lines: PackLine[], description: string): PackLine {
  const found = lines.filter((row) => row.description === description);
  if (found.length !== 1)
    throw new Error(
      `Expected one "${description}" line, found ${found.length}`,
    );
  return found[0]!;
}

export function sources(row: PackLine): Array<{
  sourceType: string;
  sourceId: string;
  ruleVersion: number | null;
  quantity: number;
  formula: string;
}> {
  return JSON.parse(row.sourcesJson ?? "[]");
}

export async function addDish(
  proof: Proof,
  tenantId: string,
  eventId: string,
  name: string,
  servings: number,
  note?: string,
): Promise<{ dishId: string; eventDishId: string }> {
  const roles = rolesFor(proof, tenantId);
  const dish = await runner(proof, roles.kitchen)(M.Dish_createViaIntroduce, {
    name,
    portionSize: 1,
    portionUnit: "portion",
  });
  const eventDish = await runner(proof, roles.events)(
    M.EventDish_createViaAddToEvent,
    {
      eventId,
      dishId: dish.docId,
      quantityServings: servings,
      ...(note ? { specialInstructions: note } : {}),
    },
  );
  return { dishId: dish.docId, eventDishId: eventDish.docId };
}

export async function defineRule(
  proof: Proof,
  tenantId: string,
  rule: Record<string, unknown>,
): Promise<string> {
  const roles = rolesFor(proof, tenantId);
  const made = await runner(proof, roles.logistics)(
    M.PackRule_createViaDefine,
    rule,
  );
  return made.docId;
}

export async function version(actor: Role, docId: string): Promise<number> {
  return (await readRow<{ version: number }>(actor, docId)).version;
}
