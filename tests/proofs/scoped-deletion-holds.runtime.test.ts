/**
 * AC-155 (PR12-09): a deletion request lists the affected records and holds
 * before anything changes, needs admin authority, and never touches held
 * pay or employment history. A hold stops the erase until it is released;
 * every erase and hold leaves an audit row. Synthetic workspace.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-scoped-erase";
const otherTenant = "tenant-scoped-erase-other";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const person = async (
      givenName: string,
      role: string,
      subject: string,
      status = "active",
      tenant = tenantId,
    ) =>
      (await ctx.db.insert("people", {
        tenantId: tenant,
        givenName,
        familyName: "Proof",
        employmentType: "part_time",
        status,
        deletedAt: null,
        version: 1,
        email: `${subject}@example.test`,
        phone: "555-0100",
        addressLine1: "1 Home Street",
        city: "Springfield",
        role,
        authSubjectId: subject,
      } as never)) as Id<"people">;
    const adminId = await person("Ada", "admin", "erase-admin");
    await person("Max", "manager", "erase-manager");
    const leaverId = await person("Lee", "staff", "erase-leaver", "terminated");
    const freshId = await person("Fin", "staff", "erase-fresh", "inactive");
    const workingId = await person("Wes", "staff", "erase-working");
    const outsiderId = await person(
      "Oz",
      "staff",
      "erase-outsider",
      "terminated",
      otherTenant,
    );
    for (const personId of [leaverId, freshId]) {
      await ctx.db.insert("availabilityWindows", {
        tenantId,
        personId,
        status: "active",
        notes: "School pickup Tuesdays",
        version: 1,
      });
    }
    const shiftId = await ctx.db.insert("shifts", {
      tenantId,
      personId: leaverId,
      status: "completed",
      version: 1,
    });
    const payrollId = await ctx.db.insert("payrollInputs", {
      tenantId,
      personId: leaverId,
      periodStart: 1,
      periodEnd: 2,
      shiftId,
      regularMinutes: 300,
      overtimeMinutes: 0,
      totalMinutes: 300,
      status: "finalized",
      version: 1,
    });
    const clientId = await ctx.db.insert("clients", {
      tenantId,
      clientType: "company",
      companyName: "Proof Co",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
      version: 1,
    });
    const contactId = await ctx.db.insert("clientContacts", {
      tenantId,
      clientId,
      givenName: "Cara",
      familyName: "Contact",
      email: "cara@example.test",
      phone: "555-0199",
      isPrimary: true,
      isBillingContact: false,
      status: "active",
      version: 1,
    });
    const messageId = await ctx.db.insert("clientCommunications", {
      tenantId,
      clientId,
      clientContactId: contactId,
      medium: "call",
      summary: "Talked about the menu",
      authorName: "Ada Proof",
      version: 1,
    });
    return {
      adminId,
      leaverId,
      freshId,
      workingId,
      outsiderId,
      shiftId,
      payrollId,
      contactId,
      messageId,
    };
  });
}

function signIn(t: ReturnType<typeof convexTest>, subject: string) {
  return t.withIdentity({
    subject,
    tokenIdentifier: `proof|${subject}`,
    role: "org:member",
    tenantId,
  });
}

describe("AC-155 scoped erase with holds", () => {
  it("a deletion request lists affected records and holds, requires admin authority, and never touches held financial/employment history", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const admin = signIn(t, "erase-admin");
    const manager = signIn(t, "erase-manager");
    const leaver = { subjectType: "staff" as const, subjectId: ids.leaverId };

    // Admin authority only.
    await expect(
      manager.query(api.personalDataErasure.preview, leaver),
    ).rejects.toThrow(/Only an organization admin/);
    await expect(
      manager.mutation(api.personalDataErasure.erase, leaver),
    ).rejects.toThrow(/Only an organization admin/);

    // Another company's person is not found.
    expect(
      await admin.query(api.personalDataErasure.preview, {
        subjectType: "staff",
        subjectId: ids.outsiderId,
      }),
    ).toBeNull();

    // Preview names what goes, what stays and why, before anything changes.
    const preview = await admin.query(api.personalDataErasure.preview, leaver);
    expect(preview?.blockers).toEqual([]);
    expect(preview?.deleted).toEqual([
      { label: "Availability notes", count: 1 },
    ]);
    expect(preview?.kept.map((group) => [group.label, group.count])).toEqual([
      ["Pay and hours", 1],
      ["Shifts and event work", 1],
    ]);
    expect(preview?.namesKept).toBe(true);
    expect(preview?.fieldsErased).not.toContain("Name");

    // A hold stops the erase until it is released.
    await expect(
      admin.mutation(api.personalDataErasure.placeHold, {
        ...leaver,
        reason: " ",
      }),
    ).rejects.toThrow(/Say why/);
    await admin.mutation(api.personalDataErasure.placeHold, {
      ...leaver,
      reason: "Wage claim open",
    });
    const held = await admin.query(api.personalDataErasure.preview, leaver);
    expect(held?.hold?.reason).toBe("Wage claim open");
    await expect(
      admin.mutation(api.personalDataErasure.erase, leaver),
    ).rejects.toThrow(/On hold: Wage claim open/);
    await admin.mutation(api.personalDataErasure.releaseHold, leaver);

    await admin.mutation(api.personalDataErasure.erase, leaver);
    const after = await t.run(async (ctx) => ({
      person: await ctx.db.get(ids.leaverId),
      shift: await ctx.db.get(ids.shiftId),
      payroll: await ctx.db.get(ids.payrollId),
      availability: await ctx.db
        .query("availabilityWindows")
        .withIndex("by_personId", (q) => q.eq("personId", ids.leaverId))
        .collect(),
    }));
    expect(after.person).toMatchObject({
      givenName: "Lee",
      familyName: "Proof",
      phone: null,
      addressLine1: null,
      city: null,
      authSubjectId: null,
    });
    expect(after.person?.email).toMatch(/@erased\.invalid$/);
    expect(after.availability).toEqual([]);
    // Held pay and employment history is untouched.
    expect(after.shift).toMatchObject({ status: "completed", version: 1 });
    expect(after.payroll).toMatchObject({
      status: "finalized",
      totalMinutes: 300,
      version: 1,
    });
    // A second erase is refused, not repeated.
    await expect(
      admin.mutation(api.personalDataErasure.erase, leaver),
    ).rejects.toThrow(/already erased/);

    // No work history: the name goes too.
    await admin.mutation(api.personalDataErasure.erase, {
      subjectType: "staff",
      subjectId: ids.freshId,
    });
    const fresh = await t.run((ctx) => ctx.db.get(ids.freshId));
    expect(fresh).toMatchObject({
      givenName: "Former",
      familyName: "staff member",
    });

    // Someone still working, or the admin themselves, is refused.
    await expect(
      admin.mutation(api.personalDataErasure.erase, {
        subjectType: "staff",
        subjectId: ids.workingId,
      }),
    ).rejects.toThrow(/still works here/);
    await expect(
      admin.mutation(api.personalDataErasure.erase, {
        subjectType: "staff",
        subjectId: ids.adminId,
      }),
    ).rejects.toThrow(/your own details/);

    // Client contact: details cleared, messages kept.
    const contactPreview = await admin.query(api.personalDataErasure.preview, {
      subjectType: "client_contact",
      subjectId: ids.contactId,
    });
    expect(contactPreview?.kept).toEqual([
      expect.objectContaining({ label: "Messages with the client", count: 1 }),
    ]);
    expect(contactPreview?.warnings[0]).toMatch(/no main contact/);
    await admin.mutation(api.personalDataErasure.erase, {
      subjectType: "client_contact",
      subjectId: ids.contactId,
    });
    const contactAfter = await t.run(async (ctx) => ({
      contact: await ctx.db.get(ids.contactId),
      message: await ctx.db.get(ids.messageId),
    }));
    expect(contactAfter.contact).toMatchObject({
      givenName: "Removed contact",
      email: null,
      phone: null,
      status: "removed",
      isPrimary: false,
    });
    expect(contactAfter.message?.summary).toBe("Talked about the menu");

    // Every hold and erase is audited: who, when, which person.
    const history = await admin.query(api.personalDataErasure.history, {});
    expect(history.map((row) => row.type).sort()).toEqual([
      "PersonalDataErased",
      "PersonalDataErased",
      "PersonalDataErased",
      "PersonalDataHoldPlaced",
      "PersonalDataHoldReleased",
    ]);
    expect(history.every((row) => row.by === "Ada Proof")).toBe(true);
    const audits = await t.run((ctx) =>
      ctx.db.query("commandAuditRecords").collect(),
    );
    expect(
      audits.filter((row) => row.eventType === "PersonalDataErased"),
    ).toHaveLength(3);
  });
});
