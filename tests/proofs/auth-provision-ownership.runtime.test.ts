/**
 * AC-149 (PR12-02): sending a worker their sign-in checks who is asking, which
 * company, and which person before anything changes at the sign-in service.
 * A non-manager, a manager from another company, or a sign-in that already
 * belongs to someone else makes no outside change (no new account, no
 * password, no invitation, no re-link). A retry keeps the sign-in the worker
 * already has instead of making a second one. The sign-in service is a fake;
 * synthetic workspaces.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { installFakeClerk } from "./fake-clerk.runtime.helpers";

const tenantA = "tenant-provision-a";
const tenantB = "tenant-provision-b";

let clerk: ReturnType<typeof installFakeClerk> | null = null;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

afterEach(() => {
  clerk?.restore();
  clerk = null;
});

async function refusal(call: () => Promise<unknown>): Promise<string | null> {
  try {
    await call();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const person = async (
      tenantId: string,
      givenName: string,
      role: string,
      email: string,
      authSubjectId?: string,
    ) =>
      (await ctx.db.insert("people", {
        tenantId,
        givenName,
        familyName: "Proof",
        email,
        role,
        employmentType: "full_time",
        status: "active",
        deletedAt: null,
        version: 1,
        ...(authSubjectId ? { authSubjectId } : {}),
      } as never)) as Id<"people">;
    return {
      hrA: await person(
        tenantA,
        "Hana",
        "workforce_manager",
        "hana@a.test",
        "prov-hr-a",
      ),
      staffA: await person(
        tenantA,
        "Sid",
        "staff",
        "sid@a.test",
        "prov-staff-a",
      ),
      newHire: await person(tenantA, "Nina", "staff", "nina@a.test"),
      hrB: await person(
        tenantB,
        "Bea",
        "workforce_manager",
        "bea@b.test",
        "prov-hr-b",
      ),
      // Tenant B's worker already signs in with the account that owns
      // shared@b.test.
      linkedB: await person(
        tenantB,
        "Lee",
        "staff",
        "shared@b.test",
        "user_lee",
      ),
      // Tenant A hires someone typed in with the same address.
      clashA: await person(tenantA, "Lena", "staff", "shared@b.test"),
    };
  });
}

function signIn(
  t: ReturnType<typeof convexTest>,
  subject: string,
  tenantId: string,
) {
  return t.withIdentity({
    subject,
    tokenIdentifier: `proof|${subject}`,
    tenantId,
  });
}

describe("AC-149 sign-in sending checks caller, company and person first", () => {
  it("a non-manager or a manager from another company changes nothing at the sign-in service", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    clerk = installFakeClerk();

    expect(
      await refusal(() =>
        signIn(t, "prov-staff-a", tenantA).action(
          api.authProvision.provisionStaffSignIn,
          { personId: ids.newHire },
        ),
      ),
    ).toContain("Only a manager");
    expect(
      await refusal(() =>
        signIn(t, "prov-hr-b", tenantB).action(
          api.authProvision.provisionStaffSignIn,
          { personId: ids.newHire },
        ),
      ),
    ).toContain("not found");
    expect(clerk.calls).toEqual([]);
    const row = await t.run(async (ctx) => ctx.db.get(ids.newHire));
    expect(row?.authSubjectId ?? null).toBeNull();
  });

  it("a sign-in that already belongs to someone else is refused before any outside change", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    clerk = installFakeClerk([{ id: "user_lee", email: "shared@b.test" }]);

    expect(
      await refusal(() =>
        signIn(t, "prov-hr-a", tenantA).action(
          api.authProvision.provisionStaffSignIn,
          { personId: ids.clashA },
        ),
      ),
    ).toContain("already used by another team member");
    expect(clerk.writes()).toEqual([]);
    expect(clerk.invitations).toEqual([]);
    const rows = await t.run(async (ctx) => ({
      clash: await ctx.db.get(ids.clashA),
      owner: await ctx.db.get(ids.linkedB),
    }));
    expect(rows.clash?.authSubjectId ?? null).toBeNull();
    expect(rows.owner).toMatchObject({
      authSubjectId: "user_lee",
      tenantId: tenantB,
    });
  });

  it("a retry keeps the first sign-in and invites only into the worker's own company", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    clerk = installFakeClerk();
    const hr = signIn(t, "prov-hr-a", tenantA);

    await hr.action(api.authProvision.provisionStaffSignIn, {
      personId: ids.newHire,
    });
    const first = await t.run(async (ctx) => ctx.db.get(ids.newHire));
    const created = clerk.calls.filter(
      (call) => call.method === "POST" && call.path === "/v1/users",
    );
    expect(created).toHaveLength(1);
    expect(first?.authSubjectId).toMatch(/^user_created_/);

    // The worker's email is changed on the profile only (sign-in service
    // unreachable at that moment); a resend must not make a second account.
    await t.run(async (ctx) =>
      ctx.db.patch(ids.newHire, { email: "nina.new@a.test" }),
    );
    await hr.action(api.authProvision.provisionStaffSignIn, {
      personId: ids.newHire,
    });
    await hr.action(api.authProvision.provisionStaffSignIn, {
      personId: ids.newHire,
    });

    const after = await t.run(async (ctx) => ctx.db.get(ids.newHire));
    expect(after?.authSubjectId).toBe(first?.authSubjectId);
    expect(
      clerk.calls.filter(
        (call) => call.method === "POST" && call.path === "/v1/users",
      ),
    ).toHaveLength(1);
    expect(
      clerk.calls.some((call) => call.path.includes("password")) ||
        clerk.calls.some(
          (call) =>
            call.method === "PATCH" &&
            typeof call.body === "object" &&
            call.body !== null &&
            "password" in call.body,
        ),
    ).toBe(false);
    expect(clerk.invitations.map((row) => row.organizationId)).toEqual([
      tenantA,
      tenantA,
      tenantA,
    ]);
    const people = (
      await t.run(async (ctx) => ctx.db.query("people").collect())
    ).filter((row) => row.tenantId === tenantA);
    expect(people).toHaveLength(4);
  });
});
