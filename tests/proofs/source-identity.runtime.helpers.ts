// Shared set-up for the PL-SOURCE-IDENTITY proofs: an owner in one tenant
// runs the quick import and reads back links and records.
import { convexTest } from "convex-test";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

export type Row = Record<string, unknown> & { _id: string };

export function ensureEncryptionKey() {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5jqU=";
  }
}

export function ownerOf(tenantId: string) {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  }).asRole({ subject: `${tenantId}-owner`, role: "owner", tenantId });
}

export type Actor = ReturnType<typeof ownerOf>;

export async function importRows(
  actor: Actor,
  datasetType: string,
  rows: unknown[],
) {
  return (await (
    actor as unknown as {
      action: (fn: unknown, args?: unknown) => Promise<unknown>;
    }
  ).action(api.quickImport.importFile, {
    datasetType,
    sourceSystem: "tpp_legacy",
    rows,
  })) as { committed: number; skipped: number; pending: number };
}

export async function tableRows(
  actor: Actor,
  table: string,
  tenantId: string,
): Promise<Row[]> {
  return (await actor.run(async (ctx) =>
    (
      await (ctx.db.query as (t: string) => { collect(): Promise<unknown[]> })(
        table,
      ).collect()
    ).filter((row) => (row as { tenantId?: string }).tenantId === tenantId),
  )) as Row[];
}

export const links = (actor: Actor, tenantId: string) =>
  tableRows(actor, "externalRecordLinks", tenantId);

export async function client(actor: Actor, id: unknown) {
  return (await actor.query(api.queries.getClient, {
    id: id as never,
  })) as Row | null;
}

export async function venue(actor: Actor, id: unknown) {
  return (await actor.query(api.queries.getVenue, {
    id: id as never,
  })) as Row | null;
}
