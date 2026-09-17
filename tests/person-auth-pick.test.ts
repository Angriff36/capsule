import { describe, expect, it } from "vitest";
import {
  decidePersonEmailLink,
  pickLivePerson,
  tenantIdFromIdentityClaims,
} from "../convex/lib/personAuthPick";
import {
  decodeJwtPayload,
  waitForSessionTenantClaim,
} from "../src/app/auth/sessionTenantClaim";

const staffOld = {
  _id: "p_staff_old",
  tenantId: "org_mangia",
  role: "staff",
  status: "active",
  deletedAt: null,
  authSubjectId: undefined,
  createdAt: 100,
};

const adminNew = {
  _id: "p_admin_new",
  tenantId: "org_mangia",
  role: "admin",
  status: "active",
  deletedAt: null,
  authSubjectId: undefined,
  createdAt: 200,
};

const adminOld = {
  _id: "p_admin_old",
  tenantId: "org_mangia",
  role: "admin",
  status: "active",
  deletedAt: null,
  authSubjectId: undefined,
  createdAt: 50,
};

const linkedStaff = {
  _id: "p_linked_staff",
  tenantId: "org_mangia",
  role: "staff",
  status: "active",
  deletedAt: null,
  authSubjectId: "user_ostwind",
  createdAt: 300,
};

const otherTenantAdmin = {
  _id: "p_other_admin",
  tenantId: "org_other",
  role: "admin",
  status: "active",
  deletedAt: null,
  authSubjectId: undefined,
  createdAt: 10,
};

const deletedAdmin = {
  _id: "p_deleted",
  tenantId: "org_mangia",
  role: "admin",
  status: "active",
  deletedAt: 9,
  authSubjectId: undefined,
  createdAt: 1,
};

const inactiveAdmin = {
  _id: "p_inactive",
  tenantId: "org_mangia",
  role: "admin",
  status: "inactive",
  deletedAt: null,
  authSubjectId: undefined,
  createdAt: 2,
};

describe("pickLivePerson", () => {
  it("prefers Admin over a older staff row in the same workspace", () => {
    expect(pickLivePerson([staffOld, adminNew])?._id).toBe("p_admin_new");
  });

  it("prefers the oldest live Admin when several share an email", () => {
    expect(pickLivePerson([adminNew, adminOld, staffOld])?._id).toBe(
      "p_admin_old",
    );
  });

  it("prefers a row already linked to this sign-in over another Admin", () => {
    expect(
      pickLivePerson([adminOld, linkedStaff], { subject: "user_ostwind" })?._id,
    ).toBe("p_linked_staff");
  });

  it("prefers the hinted workspace even when another tenant has an older Admin", () => {
    expect(
      pickLivePerson([otherTenantAdmin, adminNew], { tenantId: "org_mangia" })
        ?._id,
    ).toBe("p_admin_new");
  });

  it("ignores deleted and inactive rows", () => {
    expect(pickLivePerson([deletedAdmin, inactiveAdmin, staffOld])?._id).toBe(
      "p_staff_old",
    );
  });

  it("uses _creationTime when createdAt is missing", () => {
    const newer = {
      _id: "p_b",
      tenantId: "org_mangia",
      role: "staff",
      status: "active",
      _creationTime: 20,
    };
    const older = {
      _id: "p_a",
      tenantId: "org_mangia",
      role: "staff",
      status: "active",
      _creationTime: 10,
    };
    expect(pickLivePerson([newer, older])?._id).toBe("p_a");
  });

  it("returns null when no live row remains", () => {
    expect(pickLivePerson([deletedAdmin, inactiveAdmin])).toBeNull();
  });
});

describe("tenantIdFromIdentityClaims", () => {
  it("reads Clerk org id, tenantId claim, or org_id", () => {
    expect(tenantIdFromIdentityClaims({ o: { id: "org_mangia" } })).toBe(
      "org_mangia",
    );
    expect(tenantIdFromIdentityClaims({ tenantId: "org_direct" })).toBe(
      "org_direct",
    );
    expect(tenantIdFromIdentityClaims({ org_id: "org_legacy" })).toBe(
      "org_legacy",
    );
    expect(tenantIdFromIdentityClaims({})).toBe("");
  });
});

type LinkRow = {
  _id: string;
  tenantId: string;
  role: string;
  status: string;
  deletedAt: number | null;
  authSubjectId?: string | null;
  createdAt: number;
};

describe("decidePersonEmailLink account selection", () => {
  const subject = "user_ostwind";

  function fixture(): LinkRow[] {
    return [
      {
        _id: "p_other",
        tenantId: "org_other",
        role: "admin",
        status: "active",
        deletedAt: null,
        authSubjectId: undefined,
        createdAt: 10,
      },
      {
        _id: "p_mangia",
        tenantId: "org_mangia",
        role: "admin",
        status: "active",
        deletedAt: null,
        authSubjectId: undefined,
        createdAt: 20,
      },
    ];
  }

  it("returns ambiguity instead of choosing an unhinted cross-tenant membership", () => {
    const decision = decidePersonEmailLink({
      subject,
      linkedLive: [],
      neverLinkedLiveMatches: fixture(),
    });
    expect(decision.kind).toBe("ambiguous");
  });

  it("selects the membership in the hinted organization for linking", () => {
    const decision = decidePersonEmailLink({
      subject,
      tenantId: "org_mangia",
      linkedLive: [],
      neverLinkedLiveMatches: fixture(),
    });
    expect(decision).toMatchObject({
      kind: "persist",
      person: { _id: "p_mangia", tenantId: "org_mangia" },
    });
  });

  it("selects the hinted unlinked membership over a stale other-organization link", () => {
    const rows = fixture();
    const decision = decidePersonEmailLink({
      subject,
      tenantId: "org_mangia",
      linkedLive: [{ ...rows[0]!, authSubjectId: subject }],
      neverLinkedLiveMatches: [rows[1]!],
    });
    expect(decision).toMatchObject({
      kind: "persist",
      person: { _id: "p_mangia", tenantId: "org_mangia" },
    });
  });
});

function jwtWithTenant(tenantId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ o: { id: tenantId } }),
    "utf8",
  ).toString("base64url");
  return `hdr.${payload}.sig`;
}

describe("waitForSessionTenantClaim", () => {
  it("does not succeed until the JWT tenant equals the chosen org", async () => {
    const tokens = [jwtWithTenant("org_other"), jwtWithTenant("org_mangia")];
    const ready = await waitForSessionTenantClaim({
      organizationId: "org_mangia",
      getToken: async () => tokens.shift() ?? jwtWithTenant("org_mangia"),
      tries: 3,
      delayMs: 0,
    });
    expect(ready).toBe(true);
    expect(tokens).toHaveLength(0);
  });

  it("returns false when the JWT tenant never matches", async () => {
    const ready = await waitForSessionTenantClaim({
      organizationId: "org_mangia",
      getToken: async () => jwtWithTenant("org_other"),
      tries: 2,
      delayMs: 0,
    });
    expect(ready).toBe(false);
  });

  it("reads Clerk org id from the session JWT payload", () => {
    expect(decodeJwtPayload(jwtWithTenant("org_mangia"))).toEqual({
      o: { id: "org_mangia" },
    });
  });

  it("returns null for a non-object or malformed JWT payload", () => {
    const nonObject = `h.${btoa("42")}.s`;
    expect(decodeJwtPayload(nonObject)).toBeNull();
    expect(decodeJwtPayload("h.%%%not-base64%%%.s")).toBeNull();
    expect(decodeJwtPayload(null)).toBeNull();
    expect(decodeJwtPayload("")).toBeNull();
    expect(decodeJwtPayload("no-dots")).toBeNull();
    expect(decodeJwtPayload("h..s")).toBeNull();
  });
});
