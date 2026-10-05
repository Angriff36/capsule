/**
 * Runtime proof (PL-AUTH, AC-151 cached-client leg): a browser that stays
 * signed in keeps the same sign-in token, and that token may still carry
 * broad workspace and role claims (a Clerk organization member's
 * "org:owner"). Access must follow the staff profile on every call, not what
 * the device holds. When an admin changes a person's role, the very next
 * read and change from the same, unchanged sign-in follow the new role: the
 * client list goes empty, a client the device already knows by id reads as
 * missing, and client changes are refused. Synthetic workspace.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-cached-client";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function refused(call: () => Promise<unknown>) {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}

describe("runtime proof: a signed-in device cannot keep access after a role change (AC-151)", () => {
  it("follows the staff profile on the next call, whatever the sign-in claims say", async () => {
    const t = convexTest(schema, modules);
    const salesPersonId = await t.run(async (ctx) => {
      const person = {
        tenantId,
        familyName: "Proof",
        employmentType: "full_time",
        status: "active",
        version: 1,
      };
      await ctx.db.insert("people", {
        ...person,
        givenName: "Olive",
        email: "olive@example.test",
        role: "owner",
        authSubjectId: "cached-client-owner",
      } as never);
      return (await ctx.db.insert("people", {
        ...person,
        givenName: "Sam",
        email: "sam@example.test",
        role: "sales_manager",
        authSubjectId: "cached-client-sales",
      } as never)) as Id<"people">;
    });
    const owner = t.withIdentity({
      subject: "cached-client-owner",
      tokenIdentifier: "cached|owner",
      tenantId,
    });
    // The same token all the way through, carrying an owner claim.
    const sales = t.withIdentity({
      subject: "cached-client-sales",
      tokenIdentifier: "cached|sales",
      role: "org:owner",
      tenantId,
    });

    const { docId: clientId } = (await sales.mutation(
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Cached Client Co" },
    )) as { docId: Id<"clients"> };
    expect(
      ((await sales.query(api.queries.listClient, {})) as unknown[]).length,
    ).toBe(1);
    expect(await sales.query(api.queries.getClient, { id: clientId })).not.toBe(
      null,
    );

    await owner.mutation(api.mutations.Person_assignRole, {
      docId: salesPersonId,
      role: "kitchen_staff",
      version: 1,
    });

    expect(await sales.query(api.queries.listClient, {})).toEqual([]);
    expect(await sales.query(api.queries.getClient, { id: clientId })).toBe(
      null,
    );
    expect(
      await refused(() =>
        sales.mutation(api.mutations.Client_createViaRegister, {
          clientType: "company",
          companyName: "After the change",
        }),
      ),
    ).toBe(true);
    const clients = await t.run(async (ctx) =>
      ctx.db.query("clients").collect(),
    );
    expect(clients.map((c) => c.companyName)).toEqual(["Cached Client Co"]);
  });
});
