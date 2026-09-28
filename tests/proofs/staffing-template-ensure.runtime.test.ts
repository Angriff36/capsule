/**
 * Crew templates (spec §12.2; AC-495, AC-503, AC-504):
 * - approving an event whose service style and guest count match an active
 *   crew template posts that crew once: per-guest lines scale, each need
 *   carries role, certificate, uniform, location, pay basis, budget and the
 *   crew window;
 * - a guest-count change adds or cancels only OPEN slots; claimed/filled
 *   work is never touched; running it again changes nothing;
 * - a need that asks for a certificate refuses someone without it, and the
 *   filled shift carries the certificate;
 * - no matching template = approval adds no staff (AC-399 unchanged).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  harness,
  rolesFor,
  runner,
  S,
  type Proof,
} from "./staffing-window-override-survival.runtime.helpers";

const M = api.mutations;
const DAY = 86_400_000;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const LINES = JSON.stringify([
  {
    role: "Captain",
    fixedCount: 1,
    uniform: "Black suit",
    payBasis: "hourly",
    budgetHourlyRate: 32,
  },
  {
    role: "Server",
    guestsPerWorker: 20,
    minCount: 2,
    qualificationName: "Food handler",
    uniform: "Black shirt, black pants",
    workLocation: "Dining room",
    skills: "French service",
    payBasis: "hourly",
    budgetHourlyRate: 24,
  },
]);

async function setup(proof: Proof, tenantId: string, guests: number) {
  const roles = rolesFor(proof, tenantId);
  const manage = runner(proof, roles.workforce);
  const runEvents = runner(proof, roles.events);
  const runSales = runner(proof, roles.sales);
  const style = await runner(
    proof,
    proof.asRole({
      subject: `owner-${tenantId}`,
      role: "owner",
      tenantId,
    }),
  )(M.ServiceStyle_createViaRegister, { name: "Plated", code: "plated" });
  const client = await runSales(M.Client_createViaRegister, {
    clientType: "company",
    companyName: `${tenantId} client`,
  });
  const event = await runSales(M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title: "Plated gala",
    eventType: "gala",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: guests,
    primaryContactName: "Casey Crewsheet",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });
  const read = <T>(id: string) =>
    roles.workforce.run(async (ctx) => ctx.db.get(id as never)) as Promise<T>;
  const version = async () => (await read<Doc<"events">>(event.docId)).version;
  await runEvents(M.Event_changeServiceStyle, {
    docId: event.docId,
    version: await version(),
    serviceStyleId: style.docId,
    serviceStyleName: "Plated",
  });
  await runEvents(M.Event_configureTiming, {
    docId: event.docId,
    version: await version(),
    serviceStartsAt: S.startsAt,
    setupMinutes: 120,
    loadMinutes: 30,
    outboundTravelMinutes: 30,
    cleanupMinutes: 60,
    returnTravelMinutes: 30,
    unloadMinutes: 30,
  });
  const liveNeeds = async () =>
    (
      (await roles.workforce.run(async (ctx) =>
        ctx.db.query("eventStaffNeeds").collect(),
      )) as Doc<"eventStaffNeeds">[]
    ).filter(
      (row) => row.eventId === event.docId && row.status !== "cancelled",
    );
  async function approve() {
    await runEvents(M.Event_submitForApproval, {
      docId: event.docId,
      version: await version(),
    });
    await runEvents(M.Event_approve, {
      docId: event.docId,
      version: await version(),
    });
  }
  return {
    roles,
    manage,
    runEvents,
    read,
    version,
    eventId: event.docId,
    styleId: style.docId,
    liveNeeds,
    approve,
  };
}

describe("crew templates (AC-495, AC-503, AC-504)", () => {
  it("approval posts the sized crew once with its demand facts; guest changes move only open slots", async () => {
    const proof = harness();
    const s = await setup(proof, "tenant-crew-template", 50);
    await s.manage(M.StaffingTemplate_createViaDefine, {
      name: "Plated 40-120",
      lines: LINES,
      serviceStyleId: s.styleId,
      minGuests: 40,
      maxGuests: 120,
    });
    // A looser any-style template loses to the style match.
    await s.manage(M.StaffingTemplate_createViaDefine, {
      name: "Any event",
      lines: JSON.stringify([{ role: "Dishwasher", fixedCount: 1 }]),
    });
    expect(await s.liveNeeds()).toHaveLength(0);
    await s.approve();

    const needs = await s.liveNeeds();
    const byRole = (role: string) => needs.filter((row) => row.role === role);
    expect(byRole("Captain")).toHaveLength(1);
    expect(byRole("Server")).toHaveLength(3); // 50 guests / 20 = 3
    expect(byRole("Dishwasher")).toHaveLength(0);
    expect(
      byRole("Server")
        .map((row) => row.templateSlot)
        .sort(),
    ).toEqual([1, 2, 3]);
    expect(byRole("Server")[0]).toMatchObject({
      status: "open",
      qualificationName: "Food handler",
      uniform: "Black shirt, black pants",
      workLocation: "Dining room",
      skills: "French service",
      payBasis: "hourly",
      budgetHourlyRate: 24,
      followsEventTiming: true,
    });
    expect(byRole("Server")[0]!.startsAt).toEqual(expect.any(Number));
    expect(byRole("Server")[0]!.endsAt).toEqual(expect.any(Number));

    // An unqualified person is refused; a holder fills and the shift carries it.
    const hire = async (name: string) =>
      (
        await s.manage(M.Person_createViaHire, {
          givenName: name,
          familyName: "Crew",
          email: `${name.toLowerCase()}@template.example`,
          role: "event_staff",
          employmentType: "part_time",
        })
      ).docId;
    const pat = await hire("Pat");
    const quinn = await hire("Quinn");
    const cert = await s.manage(M.Qualification_createViaGrant, {
      personId: quinn,
      name: "Food handler",
      certificationType: "Food safety",
      issuingBody: "County",
      issuedAt: S.startsAt - 100 * DAY,
      expiresAt: S.startsAt + 300 * DAY,
    });
    const slot1 = byRole("Server").find((row) => row.templateSlot === 1)!;
    // Background timing follow-up can bump a need's version; read it fresh.
    const fresh = async () =>
      (await s.read<Doc<"eventStaffNeeds">>(slot1._id)).version;
    await expect(
      s.manage(M.EventStaffNeed_fill, {
        docId: slot1._id,
        version: await fresh(),
        personId: pat,
      }),
    ).rejects.toThrow(/Pat Crew needs a current Food handler certificate/);
    await s.manage(M.EventStaffNeed_fill, {
      docId: slot1._id,
      version: await fresh(),
      personId: quinn,
    });
    const quinnShifts = (
      (await s.roles.workforce.run(async (ctx) =>
        ctx.db.query("shifts").collect(),
      )) as Doc<"shifts">[]
    ).filter((row) => row.personId === quinn && row.status === "scheduled");
    expect(quinnShifts).toHaveLength(1);
    expect(quinnShifts[0]!.requiredQualificationId).toBe(cert.docId);

    // Fewer guests: only open server slots go; the filled one stays.
    await s.runEvents(M.Event_changeHeadcount, {
      docId: s.eventId,
      version: await s.version(),
      newHeadcount: 40,
    });
    let servers = (await s.liveNeeds()).filter((row) => row.role === "Server");
    expect(servers).toHaveLength(2);
    expect(servers.find((row) => row._id === slot1._id)?.status).toBe("filled");

    // More guests: new slots take the free numbers; nothing is duplicated.
    await s.runEvents(M.Event_changeHeadcount, {
      docId: s.eventId,
      version: await s.version(),
      newHeadcount: 90,
    });
    servers = (await s.liveNeeds()).filter((row) => row.role === "Server");
    expect(servers).toHaveLength(5);
    expect(new Set(servers.map((row) => row.templateSlot)).size).toBe(5);
    expect(
      (await s.liveNeeds()).filter((row) => row.role === "Captain"),
    ).toHaveLength(1);
  });

  it("with no matching template approval adds no staff", async () => {
    const proof = harness();
    const s = await setup(proof, "tenant-crew-template-none", 300);
    await s.manage(M.StaffingTemplate_createViaDefine, {
      name: "Plated 40-120",
      lines: LINES,
      serviceStyleId: s.styleId,
      minGuests: 40,
      maxGuests: 120,
    });
    await s.approve();
    expect(await s.liveNeeds()).toHaveLength(0);
  });
});
