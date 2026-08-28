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

function applyEmailLink(
  rows: LinkRow[],
  opts: { subject: string; tenantId?: string },
) {
  const linkedLive = rows.filter((row) => row.authSubjectId === opts.subject);
  const neverLinkedLiveMatches = rows.filter(
    (row) => row.authSubjectId == null,
  );
  const decision = decidePersonEmailLink({
    subject: opts.subject,
    tenantId: opts.tenantId,
    linkedLive,
    neverLinkedLiveMatches,
  });
  if (decision.kind === "persist") {
    for (const row of rows) {
      if (row.authSubjectId === opts.subject) row.authSubjectId = null;
    }
    const target = rows.find((row) => row._id === decision.person._id);
    if (target) target.authSubjectId = opts.subject;
  }
  return decision;
}

describe("decidePersonEmailLink persist rematch", () => {
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

  it("does not write authSubjectId on an unhinted cross-tenant pick", () => {
    const rows = fixture();
    const decision = applyEmailLink(rows, { subject });
    expect(decision.kind).toBe("ambiguous");
    expect(rows[0]?.authSubjectId).toBeUndefined();
    expect(rows[1]?.authSubjectId).toBeUndefined();
  });

  it("persists the hinted Mangia Admin and clears the other subject", () => {
    const rows = fixture();
    applyEmailLink(rows, { subject });
    const hinted = applyEmailLink(rows, {
      subject,
      tenantId: "org_mangia",
    });
    expect(hinted.kind).toBe("persist");
    expect(rows.find((row) => row._id === "p_mangia")?.authSubjectId).toBe(
      subject,
    );
    expect(
      rows.find((row) => row._id === "p_other")?.authSubjectId,
    ).toBeUndefined();
    expect(pickLivePerson(rows, { subject, tenantId: "org_mangia" })?._id).toBe(
      "p_mangia",
    );
  });

  it("rematches a leftover other-tenant link onto the hinted never-linked row", () => {
    const rows = fixture();
    rows[0]!.authSubjectId = subject;
    const rematch = applyEmailLink(rows, {
      subject,
      tenantId: "org_mangia",
    });
    expect(rematch.kind).toBe("persist");
    expect(rows.find((row) => row._id === "p_mangia")?.authSubjectId).toBe(
      subject,
    );
    expect(rows.find((row) => row._id === "p_other")?.authSubjectId).toBeNull();
    expect(pickLivePerson(rows, { subject, tenantId: "org_mangia" })?._id).toBe(
      "p_mangia",
    );
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
});
