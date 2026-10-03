/**
 * AC-189 (CF-1-fw4): a step runs its checks in Manifest's defined order -
 * permission rules, then input rules, then state checks, then the changes and
 * the event - and a refused step writes nothing and records no event.
 * Stock count start has all of them (src/inventory/stock-count.manifest).
 * Known gap: generated code checks state before input rules (last case).
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const TENANT = "tenant-check-order";

async function seedPerson(t: TestConvex, subject: string, role: string) {
  await t.run(
    async (ctx) =>
      (await ctx.db.insert("people", {
        tenantId: TENANT,
        givenName: "Ada",
        familyName: subject,
        email: `${subject}@proof.test`,
        role,
        employmentType: "full_time",
        status: "active",
        deletedAt: null,
        version: 1,
        authSubjectId: subject,
      } as never)) as Id<"people">,
  );
  return t.withIdentity({
    subject,
    tokenIdentifier: `proof|${subject}`,
    tenantId: TENANT,
  });
}

const sessions = (t: TestConvex) =>
  t.run(async (ctx) => ctx.db.query("stockCountSessions").collect());
const started = (t: TestConvex) =>
  t.run(async (ctx) =>
    (await ctx.db.query("manifestEvents").collect()).filter(
      (row) => (row as { type?: string }).type === "StockCountSessionStarted",
    ),
  );

const valid = {
  label: "Walk-in count",
  locationIds: '["walk-in"]',
  locationNames: "Walk-in",
  lineCount: 0,
};

describe("runtime proof: Manifest check order (AC-189)", () => {
  it("permission rules first, then input rules, then the change and its event; refusals write nothing", async () => {
    const t = setup();
    const server = await seedPerson(t, "server", "staff");
    const counter = await seedPerson(t, "counter", "inventory_staff");

    // 1. No inventory access and a blank name: the permission rule answers,
    //    not the name rule.
    await expect(
      server.mutation(api.mutations.StockCountSession_createViaStart, {
        ...valid,
        label: "  ",
      }),
    ).rejects.toThrow(/Inventory staff/);
    expect(await sessions(t)).toHaveLength(0);
    expect(await started(t)).toHaveLength(0);

    // 2. Allowed, blank name: the input rule answers; nothing is written.
    await expect(
      counter.mutation(api.mutations.StockCountSession_createViaStart, {
        ...valid,
        label: "  ",
      }),
    ).rejects.toThrow(/Give this count session a name/);
    expect(await sessions(t)).toHaveLength(0);
    expect(await started(t)).toHaveLength(0);

    // 3. Allowed and valid: the change is written, then its event.
    await counter.mutation(
      api.mutations.StockCountSession_createViaStart,
      valid,
    );
    const [session] = await sessions(t);
    expect(session).toMatchObject({ label: "Walk-in count" });
    expect(await started(t)).toHaveLength(1);
    const before = session!.version;

    // 4. Starting the started session again: the state check refuses it.
    const refused = await counter
      .mutation(api.mutations.StockCountSession_start, {
        docId: session!._id,
        version: before,
        ...valid,
        label: "Second start",
      } as never)
      .then(
        () => null,
        (error: unknown) => String(error),
      );
    expect(refused).not.toBeNull();
    expect(refused).not.toMatch(
      /Give this count session a name|Inventory staff/,
    );

    // The refusal changed nothing and recorded no event.
    const [after] = await sessions(t);
    expect(after).toMatchObject({ label: "Walk-in count", version: before });
    expect(await started(t)).toHaveLength(1);
  });

  // Manifest checks input rules before state checks; the generated Convex
  // code checks state first ("Guard 0 failed"). Generator fault, recorded in
  // the loop checklist; this case flips to a normal test once it is fixed.
  it.fails("input rules answer before state checks", async () => {
    const t = setup();
    const counter = await seedPerson(t, "counter", "inventory_staff");
    await counter.mutation(
      api.mutations.StockCountSession_createViaStart,
      valid,
    );
    const [session] = await sessions(t);
    await expect(
      counter.mutation(api.mutations.StockCountSession_start, {
        docId: session!._id,
        version: session!.version,
        ...valid,
        label: "  ",
      } as never),
    ).rejects.toThrow(/Give this count session a name/);
  });
});
