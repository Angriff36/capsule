/**
 * AC-123 (PR09-02): correcting a worker's email keeps one staff profile, its
 * history and its sign-in; the sign-in moves to the new address. When the new
 * address already belongs to another team member, or to a different sign-in,
 * the manager is told who/what before anything changes, and nothing is
 * merged. Linking an existing login to a hired worker keeps that one
 * profile. The sign-in service is a fake; synthetic workspace.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { installFakeClerk } from "./fake-clerk.runtime.helpers";

const tenantId = "tenant-email-correction";

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
    const data = (error as { data?: unknown }).data;
    if (typeof data === "string") return data;
    return error instanceof Error ? error.message : String(error);
  }
}

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const person = async (
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
    const hrId = await person(
      "Hana",
      "workforce_manager",
      "hana@x.test",
      "mail-hr",
    );
    const cookId = await person(
      "Cody",
      "staff",
      "cody.old@x.test",
      "user_cody",
    );
    const otherId = await person("Omar", "staff", "omar@x.test", "user_omar");
    const newHireId = await person("Nell", "staff", "nell@x.test");
    const eventId = (await ctx.db.insert("events", {
      tenantId,
      title: "Correction dinner",
      eventType: "dinner",
      stage: "planning",
      deletedAt: null,
      version: 1,
    } as never)) as Id<"events">;
    const assignmentId = await ctx.db.insert("eventAssignments", {
      tenantId,
      eventId,
      personId: cookId,
      role: "cook",
      status: "confirmed",
      deletedAt: null,
      version: 1,
    });
    return { hrId, cookId, otherId, newHireId, assignmentId };
  });
}

function hr(t: ReturnType<typeof convexTest>) {
  return t.withIdentity({
    subject: "mail-hr",
    tokenIdentifier: "proof|mail-hr",
    tenantId,
  });
}

async function storedEmail(
  t: ReturnType<typeof convexTest>,
  personId: Id<"people">,
) {
  const row = await hr(t).query(
    internal.personEmail.loadPersonForEmailCorrection,
    { personId, wanted: "" },
  );
  return row?.email;
}

async function peopleCount(t: ReturnType<typeof convexTest>) {
  return (await t.run(async (ctx) => ctx.db.query("people").collect())).filter(
    (row) => row.tenantId === tenantId,
  ).length;
}

describe("AC-123 email correction keeps one worker identity", () => {
  it("email correction keeps one Person identity and history and moves the sign-in", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    clerk = installFakeClerk([
      { id: "user_cody", email: "cody.old@x.test" },
      { id: "user_omar", email: "omar@x.test" },
    ]);
    const before = await t.run(async (ctx) => ctx.db.get(ids.assignmentId));

    const result = await hr(t).action(api.personEmail.correctStaffEmail, {
      personId: ids.cookId,
      email: "Cody.New@x.test",
    });
    expect(result).toMatchObject({
      email: "cody.new@x.test",
      signInUpdated: true,
      warning: null,
    });
    expect(await storedEmail(t, ids.cookId)).toBe("cody.new@x.test");
    expect(clerk.emailsOf("user_cody")).toEqual(["cody.new@x.test"]);
    const row = await t.run(async (ctx) => ctx.db.get(ids.cookId));
    expect(row).toMatchObject({ authSubjectId: "user_cody", status: "active" });
    expect(await t.run(async (ctx) => ctx.db.get(ids.assignmentId))).toEqual(
      before,
    );
    expect(await peopleCount(t)).toBe(4);
  });

  it("explains a conflicting team member or sign-in without merging or changing anything", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    clerk = installFakeClerk([
      { id: "user_cody", email: "cody.old@x.test" },
      { id: "user_stranger", email: "taken@x.test" },
    ]);

    expect(
      await refusal(() =>
        hr(t).action(api.personEmail.correctStaffEmail, {
          personId: ids.cookId,
          email: "omar@x.test",
        }),
      ),
    ).toContain("Omar Proof already uses omar@x.test");
    expect(
      await refusal(() =>
        hr(t).action(api.personEmail.correctStaffEmail, {
          personId: ids.cookId,
          email: "taken@x.test",
        }),
      ),
    ).toContain("already has its own Capsule sign-in");

    expect(clerk.writes()).toEqual([]);
    expect(await storedEmail(t, ids.cookId)).toBe("cody.old@x.test");
    const rows = await t.run(async (ctx) => ({
      cook: await ctx.db.get(ids.cookId),
      other: await ctx.db.get(ids.otherId),
    }));
    expect(rows.cook).toMatchObject({ authSubjectId: "user_cody", version: 1 });
    expect(rows.other).toMatchObject({
      authSubjectId: "user_omar",
      version: 1,
    });
    expect(await peopleCount(t)).toBe(4);
  });

  it("linking an existing login keeps the one hired profile and invites only into this company", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    clerk = installFakeClerk([{ id: "user_nell", email: "nell@x.test" }]);

    await hr(t).action(api.authProvision.provisionStaffSignIn, {
      personId: ids.newHireId,
    });
    const row = await t.run(async (ctx) => ctx.db.get(ids.newHireId));
    expect(row).toMatchObject({ authSubjectId: "user_nell", status: "active" });
    expect(
      clerk.calls.some(
        (call) => call.method === "POST" && call.path === "/v1/users",
      ),
    ).toBe(false);
    expect(clerk.invitations).toEqual([
      { organizationId: tenantId, email: "nell@x.test" },
    ]);
    expect(await peopleCount(t)).toBe(4);
  });
});
