import { describe, expect, it } from "vitest";
import {
  pickLivePerson,
  tenantIdFromIdentityClaims,
} from "../convex/lib/personAuthPick";

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
