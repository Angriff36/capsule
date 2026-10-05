/**
 * AC-150 (PR12-03): a sign-in with no company account in the sign-in service
 * opens its workspace through the staff profile linked to it — workspace,
 * role and company branding all come from that profile. A sign-in that does
 * carry a company account still opens that company. A sign-in linked to
 * nothing gets no workspace, and the link attempt returns the plain reason
 * the sign-in screen turns into guidance ("no_match" → ask your manager to
 * add you under Team roles). Synthetic workspaces.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Status = {
  authenticated: boolean;
  hasTenant: boolean;
  hasRole: boolean;
  role: string;
  roleSource: string;
  tenantId: string | null;
};
type Org = { brandDisplayName?: string | null };

async function seedWorkspace(
  t: ReturnType<typeof convexTest>,
  tenantId: string,
  brand: string,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("organizations", {
      tenantId,
      name: `${brand} legal name`,
      status: "active",
      brandDisplayName: brand,
      version: 1,
    });
  });
}

describe("AC-150 person-first onboarding", () => {
  it("opens the right workspace and branding with or without a company account", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t, "tenant-person-first", "Porter Catering");
    await seedWorkspace(t, "tenant-org-path", "Harbor Events");
    await t.run(async (ctx) => {
      await ctx.db.insert("people", {
        tenantId: "tenant-person-first",
        givenName: "Pat",
        familyName: "Planner",
        email: "pat@example.test",
        role: "sales_manager",
        employmentType: "full_time",
        status: "active",
        authSubjectId: "person-only-sign-in",
        deletedAt: null,
        version: 1,
      } as never);
      await ctx.db.insert("people", {
        tenantId: "tenant-person-first",
        givenName: "New",
        familyName: "Hire",
        email: "new.hire@example.test",
        role: "kitchen_staff",
        employmentType: "full_time",
        status: "active",
        deletedAt: null,
        version: 1,
      } as never);
    });

    // 1. Personal path: no company claims at all on the sign-in.
    const personOnly = t.withIdentity({
      subject: "person-only-sign-in",
      tokenIdentifier: "proof|person-only",
    });
    const personStatus = (await personOnly.query(
      api.authStatus.getAuthStatus,
      {},
    )) as Status;
    expect(personStatus).toMatchObject({
      authenticated: true,
      hasTenant: true,
      hasRole: true,
      role: "sales_manager",
      roleSource: "person",
      tenantId: "tenant-person-first",
    });
    const personOrgs = (await personOnly.query(
      api.queries.listOrganization,
      {},
    )) as Org[];
    expect(personOrgs.map((org) => org.brandDisplayName)).toEqual([
      "Porter Catering",
    ]);

    // 2. Company path: a sign-in whose company account names the workspace.
    const orgMember = t.withIdentity({
      subject: "org-member-sign-in",
      tokenIdentifier: "proof|org-member",
      o: { id: "tenant-org-path", rol: "org:admin" },
    });
    const orgStatus = (await orgMember.query(
      api.authStatus.getAuthStatus,
      {},
    )) as Status;
    expect(orgStatus).toMatchObject({
      hasTenant: true,
      role: "admin",
      roleSource: "idp",
      tenantId: "tenant-org-path",
    });
    const orgOrgs = (await orgMember.query(
      api.queries.listOrganization,
      {},
    )) as Org[];
    expect(orgOrgs.map((org) => org.brandDisplayName)).toEqual([
      "Harbor Events",
    ]);

    // 3. A sign-in linked to nothing: no workspace, no branding, and the
    //    link attempt says why so the screen can guide the person.
    const stranger = t.withIdentity({
      subject: "stranger-sign-in",
      tokenIdentifier: "proof|stranger",
    });
    const strangerStatus = (await stranger.query(
      api.authStatus.getAuthStatus,
      {},
    )) as Status;
    expect(strangerStatus).toMatchObject({
      authenticated: true,
      hasTenant: false,
      hasRole: false,
      role: "anonymous",
      tenantId: null,
    });
    expect(await stranger.query(api.queries.listOrganization, {})).toEqual([]);
    expect(
      await t.mutation(internal.authLink.linkBySubjectEmail, {
        subject: "stranger-sign-in",
        email: "stranger@example.test",
      }),
    ).toEqual({ linked: false, reason: "no_match" });

    // A person the manager already added links on first sign-in by email,
    // with no company account, and opens the manager's workspace.
    expect(
      await t.mutation(internal.authLink.linkBySubjectEmail, {
        subject: "new-hire-sign-in",
        email: "new.hire@example.test",
      }),
    ).toEqual({ linked: true, reason: "matched" });
    const newHire = t.withIdentity({
      subject: "new-hire-sign-in",
      tokenIdentifier: "proof|new-hire",
    });
    expect(
      (await newHire.query(api.authStatus.getAuthStatus, {})) as Status,
    ).toMatchObject({
      hasTenant: true,
      role: "kitchen_staff",
      roleSource: "person",
      tenantId: "tenant-person-first",
    });
    expect(
      ((await newHire.query(api.queries.listOrganization, {})) as Org[]).map(
        (org) => org.brandDisplayName,
      ),
    ).toEqual(["Porter Catering"]);
  });
});
