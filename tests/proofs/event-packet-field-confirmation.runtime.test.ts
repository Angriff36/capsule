/**
 * Runtime proof (PL-FIELD-CONFIRMATION; AC-582, AC-598..AC-607, AC-389 field
 * leg): the ten day-of forms are set up as named-person work and stay open
 * until people on the day sign them - with their own sign-in, the time it
 * really happened and any proof the form asks for. Office decisions, an
 * imported ticked box and printing never complete one. The two-person check
 * needs two different people. A late form can be chased, and the chase kept.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const finalLock = api.lib.eventPacket.finalLock;
const m = api.mutations;

const FORMS = [
  "field.leaving-shop",
  "field.takeoff-readiness",
  "field.arrival",
  "field.muda",
  "field.bins",
  "field.after-event",
  "field.return",
  "field.packing",
  "field.buffet-drawing",
  "field.leaving-event",
];

async function setup() {
  const t = convexTest(schema, modules);
  const manager = t.withIdentity({
    subject: "field-manager",
    org_id: "tenant-a",
    role: "admin",
  });
  const ids = await t.run(async (ctx) => {
    const person = (subject: string, givenName: string) =>
      ctx.db.insert("people", {
        tenantId: "tenant-a",
        givenName,
        familyName: "Crew",
        email: `${subject}@example.test`,
        role: "staff",
        employmentType: "full_time",
        status: "active",
        authSubjectId: subject,
        version: 1,
      } as never);
    const leadId = await person("field-lead", "Lena");
    const driverId = await person("field-driver", "Dario");
    const eventId = await ctx.db.insert("events", {
      tenantId: "tenant-a",
      title: "Ashley's Wedding",
      eventType: "Wedding",
      eventNumber: "6014",
      venueName: "Lakeside Lawn",
      venueAddress: "1 Shore Road",
      startsAt: Date.parse("2026-10-10T18:00:00Z"),
      endsAt: Date.parse("2026-10-10T21:00:00Z"),
      expectedHeadcount: 100,
      timingSetupMinutes: 60,
      budgetAmount: 0,
      stage: "planning",
      version: 1,
      deletedAt: null,
    });
    for (const [personId, role] of [
      [leadId, "Event lead"],
      [driverId, "Server"],
    ] as const)
      await ctx.db.insert("eventAssignments", {
        tenantId: "tenant-a",
        eventId,
        personId,
        role,
        status: "assigned",
        assignedAt: Date.now(),
        version: 1,
      } as never);
    return { eventId, leadId, driverId };
  });
  const lead = t.withIdentity({
    subject: "field-lead",
    org_id: "tenant-a",
    role: "staff",
  });
  const driver = t.withIdentity({
    subject: "field-driver",
    org_id: "tenant-a",
    role: "staff",
  });
  return { t, manager, lead, driver, ...ids };
}

const answer = (report: any, key: string) =>
  report.answers.find((a: any) => a.questionKey === key);

async function formsByKey(user: any, eventId: any) {
  const rows = await user.query(finalLock.listEventFieldForms, { eventId });
  return Object.fromEntries(rows.map((r: any) => [r.formKey, r]));
}

describe("day-of forms are people's work, never the office's", () => {
  it("sets up all ten forms unanswered with names, times and instructions; office paths never complete one", async () => {
    const { t, manager, eventId, leadId } = await setup();
    const before = await manager.query(finalLock.getFinalLock, { eventId });
    for (const form of FORMS) {
      const a = answer(before, form);
      expect(a.result).toBe("field_confirmation");
      expect(a.fieldWork.status).toBe("not_set_up");
      expect(a.action).toMatch(/^Set up the/);
    }
    await expect(
      manager.mutation(finalLock.prepareFieldForms, { eventId }),
    ).resolves.toEqual({ prepared: 10 });
    // A second run adds nothing.
    await expect(
      manager.mutation(finalLock.prepareFieldForms, { eventId }),
    ).resolves.toEqual({ prepared: 0 });
    const forms = await formsByKey(manager, eventId);
    expect(Object.keys(forms).sort()).toEqual([...FORMS].sort());
    for (const form of FORMS) {
      const row = forms[form];
      expect(row.status).toBe("open");
      expect(row.completedBy).toBeNull();
      expect(row.observedAt).toBeNull();
      expect(row.instructions).toBeTruthy();
    }
    expect(forms["field.arrival"].responsible).toBe("Lena Crew");
    expect(forms["field.arrival"].responsiblePersonId).toBe(leadId);
    // Due when the crew is due on site: an hour of setup before service.
    expect(forms["field.arrival"].dueAt).toBe(
      Date.parse("2026-10-10T17:00:00Z"),
    );
    expect(forms["field.takeoff-readiness"].needsTwoPeople).toBe(true);
    expect(forms["field.muda"].evidence).toBe("note");
    expect(forms["field.buffet-drawing"].evidence).toBe("photo");

    // Office paths: a manager decision is refused, and a ticked box saved on
    // the packet (as an imported workbook would carry) completes nothing.
    await expect(
      manager.mutation(finalLock.overrideFinalLockAnswer, {
        eventId,
        questionKey: "field.arrival",
        basedOn: answer(before, "field.arrival").basis,
        answer: "Done",
        reason: "Office says so",
      }),
    ).rejects.toThrow(/person who does it/);
    await t.run(async (ctx) => {
      await ctx.db.insert("eventPacketResolutions", {
        tenantId: "tenant-a",
        eventId,
        decisionId: "imported-arrival",
        issueKey: "field.arrival",
        actor: "field-manager",
        decidedAt: Date.now(),
        decisionJson: JSON.stringify({ id: "imported-arrival" }),
        verificationJson: JSON.stringify({
          checkKey: "field.arrival",
          answer: "yes",
          actor: "field-manager",
          at: new Date().toISOString(),
        }),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const after = await manager.query(finalLock.getFinalLock, { eventId });
    for (const form of FORMS) {
      const a = answer(after, form);
      expect(a.result).toBe("field_confirmation");
      expect(a.fieldWork.confirmedAt).toBeNull();
      expect(a.fieldWork.status).toBe("open");
      expect(a.action).toMatch(/^Complete the/);
    }
    expect(after.outcome).not.toBe("clear");

    // A manager without a staff profile cannot sign a form either.
    await expect(
      manager.mutation(m.FieldConfirmation_complete, {
        docId: forms["field.arrival"].id,
        outcome: "all_good",
      }),
    ).rejects.toThrow(/Sign in as yourself/);
  });

  it("a person signs with their own name, the real time and the proof the form asks for", async () => {
    const { t, manager, lead, driver, eventId, leadId, driverId } =
      await setup();
    await manager.mutation(finalLock.prepareFieldForms, { eventId });
    const forms = await formsByKey(manager, eventId);
    const arrival = forms["field.arrival"].id;

    await expect(
      lead.mutation(m.FieldConfirmation_complete, {
        docId: arrival,
        outcome: "all_good",
        observedAt: Date.now() + 60 * 60_000,
      }),
    ).rejects.toThrow(/can't be in the future/);
    const seenAt = Date.now() - 5 * 60_000;
    await lead.mutation(m.FieldConfirmation_complete, {
      docId: arrival,
      outcome: "all_good",
      observedAt: seenAt,
    });
    // The driver stands in for the lead on the bin sheet: kept as the driver.
    await driver.mutation(m.FieldConfirmation_complete, {
      docId: forms["field.bins"].id,
      outcome: "all_good",
    });
    await expect(
      lead.mutation(m.FieldConfirmation_complete, {
        docId: arrival,
        outcome: "all_good",
      }),
    ).rejects.toThrow(/already signed/);

    // Food waste needs the count written down; a problem always needs words.
    await expect(
      lead.mutation(m.FieldConfirmation_complete, {
        docId: forms["field.muda"].id,
        outcome: "all_good",
      }),
    ).rejects.toThrow(/Write what you saw/);
    await expect(
      lead.mutation(m.FieldConfirmation_complete, {
        docId: forms["field.after-event"].id,
        outcome: "problem",
      }),
    ).rejects.toThrow(/Write what you saw/);
    await lead.mutation(m.FieldConfirmation_complete, {
      docId: forms["field.muda"].id,
      outcome: "all_good",
      note: "2 pans chicken left, 1 tray salad thrown",
    });

    // The buffet drawing needs a real photo.
    await expect(
      lead.mutation(m.FieldConfirmation_complete, {
        docId: forms["field.buffet-drawing"].id,
        outcome: "all_good",
      }),
    ).rejects.toThrow(/Add a photo/);
    await expect(
      lead.mutation(m.FieldConfirmation_complete, {
        docId: forms["field.buffet-drawing"].id,
        outcome: "all_good",
        photoStorageId: "not-a-file",
      }),
    ).rejects.toThrow(/didn't upload/);
    const photo = await t.run((ctx) =>
      ctx.storage.store(new Blob(["buffet"], { type: "image/jpeg" })),
    );
    await lead.mutation(m.FieldConfirmation_complete, {
      docId: forms["field.buffet-drawing"].id,
      outcome: "all_good",
      photoStorageId: photo,
    });

    const rows = await formsByKey(manager, eventId);
    expect(rows["field.arrival"]).toMatchObject({
      status: "done",
      completedById: leadId,
      completedBy: "Lena Crew",
      observedAt: seenAt,
      outcome: "all_good",
    });
    expect(rows["field.bins"].completedById).toBe(driverId);
    expect(rows["field.muda"].note).toMatch(/2 pans/);
    expect(rows["field.buffet-drawing"].photoUrl).toBeTruthy();

    const report = await manager.query(finalLock.getFinalLock, { eventId });
    const done = answer(report, "field.arrival");
    expect(done.fieldWork.confirmedBy).toBe("Lena Crew");
    expect(done.fieldWork.confirmedAt).toBe(new Date(seenAt).toISOString());
    expect(done.sources).toEqual([
      { table: "fieldConfirmations", id: arrival, version: 2 },
    ]);
    expect(answer(report, "field.leaving-event").fieldWork.confirmedAt).toBe(
      null,
    );
    expect(report.outcome).toBe("needs_review");
  });

  it("before takeoff needs two different people, each signing for themselves", async () => {
    const { manager, lead, driver, eventId } = await setup();
    await manager.mutation(finalLock.prepareFieldForms, { eventId });
    const takeoff = (await formsByKey(manager, eventId))[
      "field.takeoff-readiness"
    ].id;
    await expect(
      lead.mutation(m.FieldConfirmation_countersign, { docId: takeoff }),
    ).rejects.toThrow(/first person has to sign/);
    await driver.mutation(m.FieldConfirmation_complete, {
      docId: takeoff,
      outcome: "all_good",
    });
    let report = await manager.query(finalLock.getFinalLock, { eventId });
    expect(answer(report, "field.takeoff-readiness").fieldWork).toMatchObject({
      status: "first_signed",
      confirmedAt: null,
    });
    await expect(
      driver.mutation(m.FieldConfirmation_countersign, { docId: takeoff }),
    ).rejects.toThrow(/second, different person/);
    await lead.mutation(m.FieldConfirmation_countersign, {
      docId: takeoff,
      note: "Straps on, doors locked",
    });
    report = await manager.query(finalLock.getFinalLock, { eventId });
    const done = answer(report, "field.takeoff-readiness").fieldWork;
    expect(done.status).toBe("done");
    expect(done.confirmedBy).toBe("Dario Crew and Lena Crew");
    const row = (await formsByKey(manager, eventId))["field.takeoff-readiness"];
    expect(row).toMatchObject({
      status: "done",
      completedBy: "Dario Crew",
      checkedBy: "Lena Crew",
      secondNote: "Straps on, doors locked",
    });
  });

  it("the crew see their forms, and a manager's chase of a late form is kept", async () => {
    const { manager, lead, eventId } = await setup();
    await manager.mutation(finalLock.prepareFieldForms, { eventId });
    const mine = await lead.query(finalLock.myFieldForms, {});
    expect(mine).toHaveLength(10);
    expect(mine[0].eventTitle).toBe("Ashley's Wedding");
    const arrival = mine.find((f) => f.formKey === "field.arrival")!;
    expect(arrival.responsible).toBe("Lena Crew");

    await expect(
      lead.mutation(m.FieldConfirmation_escalate, {
        docId: arrival.id,
        note: "Told myself",
      }),
    ).rejects.toThrow(/Only event or logistics managers/);
    await expect(
      manager.mutation(m.FieldConfirmation_escalate, {
        docId: arrival.id,
        note: " ",
      }),
    ).rejects.toThrow(/Say who you told/);
    await manager.mutation(m.FieldConfirmation_escalate, {
      docId: arrival.id,
      note: "Called Lena, she is on it",
    });
    const row = (await formsByKey(manager, eventId))["field.arrival"];
    expect(row.escalatedAt).toBeTypeOf("number");
    expect(row.escalationNote).toBe("Called Lena, she is on it");
    expect(row.status).toBe("open");
    const report = await manager.query(finalLock.getFinalLock, { eventId });
    expect(answer(report, "field.arrival").fieldWork.escalatedAt).toBeTruthy();
  });
});
