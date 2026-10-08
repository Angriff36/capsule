/**
 * Runtime proof (PL-AUTH, AC-151 / PR12-10 negative matrix; AC-212; AC-403):
 * workspace B cannot point its own records at workspace A records. The
 * machinery and the rest of the matrix (outside reads, outside writes, the
 * owner ledger) live in tenant-access-matrix.helpers.ts and the
 * tenant-access-matrix.*.runtime.test.ts shard files beside this one.
 * Synthetic data only.
 */
import { describe, expect, it } from "vitest";
import {
  argsFor,
  as,
  changes,
  type Doc,
  makeWorld,
  OUTSIDERS,
  publicFunctions,
  run,
  stateOfA,
  TENANT_B,
  tenantTables,
  useMatrixClock,
  variants,
} from "./tenant-access-matrix.helpers";

useMatrixClock();

describe("PL-AUTH workspace and role matrix (AC-151 / PR12-10)", () => {
  it(
    "workspace B cannot point its own records at workspace A records",
    async () => {
      // The outside-write probes aim the changed record itself at workspace A, so a
      // step that checks the record's stored links and then writes the links
      // the caller sent was never reached. Here workspace B's owner changes
      // B's own record (docId) while every other link names workspace A.
      const world = await makeWorld(true);
      expect(world.failed).toEqual([]);
      const aIds = [...world.a.seeded.values()];
      // The linked owner of workspace B (see makeWorld).
      const bOwner = as(world.t, OUTSIDERS[0]!);
      /** Every workspace B record field that names a workspace A record. */
      const bNamesA = async () => {
        const out = new Set<string>();
        await world.t.run(async (ctx) => {
          for (const table of tenantTables) {
            for (const row of (await ctx.db
              .query(table as never)
              .collect()) as Doc[]) {
              if (row.tenantId !== TENANT_B) continue;
              for (const [field, value] of Object.entries(row)) {
                const text = JSON.stringify(value) ?? "";
                if (aIds.some((id) => text.includes(id)))
                  out.add(`${table}.${field}`);
              }
            }
          }
        });
        return out;
      };
      const seen = await bNamesA();
      expect([...seen]).toEqual([]);
      let stateA = await stateOfA(world.t);
      const leaks: string[] = [];
      let probes = 0;
      let accepted = 0;
      for (const entry of await publicFunctions()) {
        if (entry.kind !== "mutation" || entry.args?.type !== "object")
          continue;
        const doc = entry.args.value.docId?.fieldType;
        for (const extra of variants(entry)) {
          const args = argsFor(entry, world.a, extra, true);
          if (doc?.type === "id")
            args.docId = world.b.seeded.get(doc.tableName) ?? args.docId;
          const out = await run(bOwner, entry, args);
          probes += 1;
          if (!("value" in out)) continue;
          accepted += 1;
          const where = `${entry.path}${extra ? ` [${extra}]` : ""}`;
          for (const field of await bNamesA()) {
            if (seen.has(field)) continue;
            seen.add(field);
            leaks.push(`${where}: ${field} names a workspace A record`);
          }
          const next = await stateOfA(world.t);
          for (const change of changes(stateA, next))
            leaks.push(`${where}: ${change}`);
          stateA = next;
        }
      }
      console.log(
        `retarget: ${probes} probes, ${accepted} accepted, ${leaks.length} leaks`,
      );
      expect(leaks).toEqual([]);
    },
    60 * 60 * 1000,
  );
});
