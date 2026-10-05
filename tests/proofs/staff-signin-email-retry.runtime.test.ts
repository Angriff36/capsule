/**
 * AC-373 (CF-15 no fire-and-forget): a failed sign-in email leaves a saved,
 * retryable record, not a silent loss. The team row shows "not sent" with a
 * plain reason (never the sign-in service's own words), sending again
 * clears it, a send whose answer was lost shows "not sure", and the record
 * holds no email address. The sign-in service is a fake; synthetic workspace.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { installFakeClerk } from "./fake-clerk.runtime.helpers";

const TENANT = "tenant-signin-retry";
const OTHER = "tenant-signin-other";

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
      hr: await person(
        TENANT,
        "Hana",
        "workforce_manager",
        "hana@a.test",
        "sr-hr",
      ),
      hire: await person(TENANT, "Nina", "staff", "nina@a.test"),
      other: await person(
        OTHER,
        "Bea",
        "workforce_manager",
        "bea@b.test",
        "sr-other",
      ),
    };
  });
}

const as = (
  t: ReturnType<typeof convexTest>,
  subject: string,
  tenantId: string,
) => t.withIdentity({ subject, tokenIdentifier: `proof|${subject}`, tenantId });

describe("AC-373 a failed sign-in email is saved and can be sent again", () => {
  it("a failure stays on the team row with plain words; sending again clears it", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    clerk = installFakeClerk();
    const hr = as(t, "sr-hr", TENANT);

    clerk.failInvitations(1, 503);
    await expect(
      hr.action(api.authProvision.provisionStaffSignIn, { personId: ids.hire }),
    ).rejects.toThrow();
    expect(clerk.invitations).toHaveLength(0);

    const [failed] = await hr.query(
      api.staffSignInEmail.listSignInEmailStates,
      {},
    );
    expect(failed).toMatchObject({
      personId: String(ids.hire),
      state: "terminal_failed",
      attemptCount: 1,
      problem: "The other system had a problem.",
    });
    expect(JSON.stringify(failed)).not.toContain("sk_live_leak");

    // The account made before the email stays linked, so the retry is one
    // click and makes no second account.
    await hr.action(api.authProvision.provisionStaffSignIn, {
      personId: ids.hire,
    });
    expect(clerk.invitations).toHaveLength(1);
    expect(
      clerk.calls.filter(
        (call) => call.method === "POST" && call.path === "/v1/users",
      ),
    ).toHaveLength(1);
    const [sent] = await hr.query(
      api.staffSignInEmail.listSignInEmailStates,
      {},
    );
    expect(sent).toMatchObject({ state: "delivered", problem: null });

    // The saved rows carry no email address and no provider words.
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", "StaffSignInEmail"))
        .collect(),
    );
    expect(rows.map((row) => row.type)).toEqual([
      "StaffSignInEmailStarted",
      "StaffSignInEmailFailed",
      "StaffSignInEmailStarted",
      "StaffSignInEmailSent",
    ]);
    const text = JSON.stringify(rows.map((row) => row.payload));
    expect(text).not.toContain("nina@a.test");
    expect(text).not.toContain("sk_live_leak");
  });

  it("a send whose answer was lost shows 'not sure' so a manager sends it again", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    clerk = installFakeClerk();
    const hr = as(t, "sr-hr", TENANT);
    await t.mutation(internal.staffSignInEmail.recordSignInEmail, {
      tenantId: TENANT,
      personId: ids.hire,
      attemptId: "lost-1",
      outcome: "started",
      requestedBy: "sr-hr",
    });
    await t.run(async (ctx) => {
      const [row] = await ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", "StaffSignInEmail"))
        .collect();
      await ctx.db.patch(row!._id, { createdAt: row!.createdAt - 10 * 60_000 });
    });
    const [lost] = await hr.query(
      api.staffSignInEmail.listSignInEmailStates,
      {},
    );
    expect(lost).toMatchObject({ state: "uncertain" });
  });

  it("only managers of the same workspace see the record", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    clerk = installFakeClerk();
    clerk.failInvitations(1, 503);
    await expect(
      as(t, "sr-hr", TENANT).action(api.authProvision.provisionStaffSignIn, {
        personId: ids.hire,
      }),
    ).rejects.toThrow();
    expect(
      await as(t, "sr-other", OTHER).query(
        api.staffSignInEmail.listSignInEmailStates,
        {},
      ),
    ).toEqual([]);
  });
});
