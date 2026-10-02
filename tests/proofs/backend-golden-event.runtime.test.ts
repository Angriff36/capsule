/**
 * Runtime proof: the golden event (PL-NATIVE-JOURNEY, backend end-state spec
 * §20.1, AC-653..AC-674). ONE tenant, ONE golden Event and one competing
 * Event in the same purchasing week, walked step by step with the same
 * identities. Each `it` is one numbered golden-event step and builds on the
 * steps before it (vitest runs them in file order over the shared world).
 * Provider boundaries are stubbed; every write goes through the governed
 * commands and seams the product screens use.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { anyApi } from "convex/server";
import { PDFDocument } from "pdf-lib";
import { api } from "../../convex/_generated/api";
import { buildWorkbook } from "../../src/lib/eventPacket/buildWorkbook";
import {
  action,
  emitted,
  eventRows,
  FACTS,
  goldenPack,
  liveRows,
  packLine,
  QUOTE,
  readRow,
  seedCrew,
  seedOperatorPerson,
  seedWorld,
  TENANT,
  versionOf,
  WEEK,
  type PackLine,
  type World,
} from "./backend-golden-event.runtime.helpers";
import {
  packView,
  type PackViewKind,
} from "../../src/features/logistics/packViews";
import { fakeRoutes, stubRouteEnv } from "./route-facts.runtime.helpers";
import { readReconciliationReceipts } from "./single-reconciliation.runtime.helpers";
import { settle } from "./timing-rules.runtime.helpers";
import {
  drafts,
  lineFor,
  linkedEventIds,
} from "./weekly-purchasing.runtime.helpers";

const M = api.mutations;
const LONG = 120_000;
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
/** Kitchen-to-venue drive (the stubbed provider answer) and timing rules. */
const ROUTE = {
  driveSeconds: 2400,
  setup: 120,
  load: 45,
  cleanup: 60,
  unload: 30,
} as const;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Converted = {
  clientId: string | null;
  leadId: string | null;
  eventId: string | null;
  proposalId: string | null;
  errors: string[];
};

/** What the packet screen reads (lib/eventPacket/commands.getPacket). */
type PacketRead = {
  snapshot: Parameters<typeof buildWorkbook>[0];
  finalLock: {
    lines: NonNullable<Parameters<typeof buildWorkbook>[1]>["finalLock"];
  };
  currentFingerprint: string;
  finalLockFingerprint: string;
  latestRevision: { stale: boolean; staleSections: string[] };
};

let w: World;
/** Day-of facts recorded in step 16 that later steps must leave alone. */
const facts = {
  orderId: "",
  flourLineId: "",
  orderedFlour: 0,
  doughId: "",
  doughQuantity: 0,
  clockInId: "",
  wasteId: "",
  invoiceTotal: 0,
};
const crew = {
  lead: { personId: "", subject: "" },
  server: { personId: "", subject: "" },
};
const id = {
  client: "",
  golden: "",
  rival: "",
  inquiryProposal: "",
  proposal: "",
  revision: "",
  breadLine: "",
  saltLine: "",
  herbLine: "",
  bitesLine: "",
  friesLine: "",
  caesarLine: "",
  truckRun: "",
};

async function submitAndConvert(eventDate: number, eventEndTime: number) {
  const submitted = await action<{
    submissionId: string;
    isDuplicate: boolean;
  }>(w.owner, api.quoteBuilder.submitQuote, {
    ...QUOTE,
    eventDate,
    eventEndTime,
  });
  expect(submitted.isDuplicate).toBe(false);
  const converted = await action<Converted>(
    w.owner,
    api.quoteBuilder.processQuoteSubmission,
    { submissionId: submitted.submissionId },
  );
  expect(converted.errors).toEqual([]);
  return converted;
}

describe.sequential("golden event journey (AC-653..AC-674)", () => {
  it(
    "golden event 01: Create or match a Client and Contact from a Lead/quote submission",
    async () => {
      w = await seedWorld();
      const first = await submitAndConvert(
        WEEK.golden.startsAt,
        WEEK.golden.endsAt,
      );
      id.client = first.clientId!;
      id.golden = first.eventId!;
      id.inquiryProposal = first.proposalId!;

      // The same person asks again for another date that week: the client
      // and contact are matched, never duplicated; the second inquiry is the
      // competing event of steps 11-12.
      const second = await submitAndConvert(
        WEEK.rival.startsAt,
        WEEK.rival.endsAt,
      );
      id.rival = second.eventId!;
      expect(second.clientId).toBe(id.client);
      expect(id.rival).not.toBe(id.golden);
      expect(await liveRows(w.owner, "clients", TENANT)).toHaveLength(1);
      expect(await liveRows(w.owner, "clientContacts", TENANT)).toHaveLength(1);
      expect(await liveRows(w.owner, "leads", TENANT)).toHaveLength(2);

      const golden = await readRow<{
        clientId: string;
        startsAt: number;
        expectedHeadcount: number;
        venueName: string | null;
      }>(w.owner, id.golden);
      expect(golden.clientId).toBe(id.client);
      expect(golden.startsAt).toBe(WEEK.golden.startsAt);
      expect(golden.expectedHeadcount).toBe(FACTS.headcount);
      expect(golden.venueName).toBe(QUOTE.venueName);
    },
    LONG,
  );

  it(
    "golden event 02: From the inquiry/Event facts, generate a branded Proposal",
    async () => {
      id.breadLine = (
        await w.run.events(M.EventDish_createViaAddToEvent, {
          eventId: id.golden,
          dishId: w.catalog.dishIds[0],
          quantityServings: FACTS.headcount,
        })
      ).docId;
      id.saltLine = (
        await w.run.events(M.EventDish_createViaAddToEvent, {
          eventId: id.golden,
          dishId: w.catalog.dishIds[1],
          quantityServings: FACTS.headcount,
        })
      ).docId;
      const built = (await w.roles.sales.mutation(
        api.lib.proposalGenerate.generateProposalDraft,
        { eventId: id.golden } as never,
      )) as { proposalId: string; created: boolean };
      // The inquiry's empty draft is filled, not joined by a second one.
      expect(built.proposalId).toBe(id.inquiryProposal);
      id.proposal = built.proposalId;
      expect(
        await eventRows(w, "proposals", id.golden).then((rows) => rows.length),
      ).toBe(1);

      const report = (await w.roles.sales.query(
        api.lib.proposalDraftReport.getProposalDraftReport,
        { proposalId: id.proposal } as never,
      )) as {
        sections: { key: string; sources: { table: string; id: string }[] }[];
      };
      for (const section of report.sections)
        expect(section.sources.length, section.key).toBeGreaterThan(0);
      expect(
        report.sections.find((s) => s.key === "venue")?.sources,
      ).toContainEqual({ table: "events", id: id.golden });
      const menu = report.sections.find((s) => s.key === "menu")!;
      expect(menu.sources).toContainEqual({
        table: "eventDishes",
        id: id.breadLine,
      });

      const proposal = await readRow<{
        subtotal: number;
        taxAmount: number;
        total: number;
      }>(w.owner, id.proposal);
      expect(proposal.subtotal).toBeCloseTo(
        FACTS.headcount * (FACTS.breadPrice + FACTS.saltedPrice),
        2,
      );

      // Sent as revision 1: the frozen web/PDF snapshot carries the same money.
      await w.roles.sales.mutation(
        api.lib.proposalRevision.sendProposalWithRevisionCapture,
        { docId: id.proposal } as never,
      );
      const revisions = (await w.owner.query(
        api.queries.listProposalRevisionByProposalId,
        { proposalId: id.proposal },
      )) as { _id: string; snapshot: string }[];
      expect(revisions).toHaveLength(1);
      id.revision = revisions[0]._id;
      const snapshot = JSON.parse(revisions[0].snapshot);
      expect(snapshot.proposal).toMatchObject({
        subtotal: proposal.subtotal,
        taxAmount: proposal.taxAmount,
        total: proposal.total,
      });
      expect(snapshot.tenant.name).toBe("Golden Kitchen Catering");
    },
    LONG,
  );

  it(
    "golden event 03: Accept/sign it twice using the same external/business identity; exactly one acceptance and one linked Event",
    async () => {
      await w.proof.executeCommand(w.owner, M.Proposal_markViewed, {
        docId: id.proposal,
      });
      await seedOperatorPerson(w);
      const request = (await w.proof.executeCommand(
        w.owner,
        M.SignatureRequest_createViaRequestSignature,
        {
          proposalRevisionId: id.revision,
          proposalId: id.proposal,
          recipientEmail: QUOTE.email,
          recipientName: QUOTE.clientName,
        },
      )) as { docId: string };
      for (let click = 0; click < 2; click++) {
        const result = (await w.owner.mutation(
          api.signatureAcceptance.completeSignature,
          { token: request.docId } as never,
        )) as { ok: boolean };
        expect(result.ok).toBe(true);
      }
      await expect(
        w.proof.executeCommand(w.owner, M.Proposal_accept, {
          docId: id.proposal,
        }),
      ).rejects.toThrow(/Guard/);

      const accepted = await emitted(w, "ProposalAccepted", id.proposal);
      expect(accepted).toHaveLength(1);
      expect(accepted[0].payload.eventId).toBe(id.golden);
      expect(
        await emitted(w, "SignatureCompleted", request.docId),
      ).toHaveLength(1);
      expect(
        (
          await liveRows<{ _id: string; tenantId: string }>(
            w.owner,
            "events",
            TENANT,
          )
        )
          .map((e) => e._id)
          .sort(),
      ).toEqual([id.golden, id.rival].sort());
      const proposal = await readRow<{
        status: string;
        eventId: string;
        total: number;
      }>(w.owner, id.proposal);
      expect(proposal.status).toBe("accepted");
      expect(proposal.eventId).toBe(id.golden);
      // The accepted total becomes the event's price; nobody types it again.
      const golden = await readRow<{ quotedPrice: number }>(w.owner, id.golden);
      expect(golden.quotedPrice).toBe(proposal.total);
    },
    LONG,
  );

  it(
    "golden event 04: Plan and approve the Event",
    async () => {
      await w.run.events(M.Event_submitForApproval, {
        docId: id.golden,
        version: await versionOf(w, id.golden),
      });
      await w.run.events(M.Event_approve, {
        docId: id.golden,
        version: await versionOf(w, id.golden),
      });
      const golden = await readRow<{
        stage: string;
        approvedAt: number | null;
      }>(w.owner, id.golden);
      expect(golden.stage).toBe("approved");
      expect(golden.approvedAt).toBeTruthy();
      expect(await emitted(w, "EventApproved", id.golden)).toHaveLength(1);
    },
    LONG,
  );

  it(
    "golden event 05: Set an operational headquarters and a real test venue. Stub only the provider boundary",
    async () => {
      stubRouteEnv();
      const google = fakeRoutes(() => ROUTE.driveSeconds);
      try {
        await w.run.owner(M.OperatingLocation_createViaAdd, {
          name: "Golden commissary",
          addressLine1: "100 Commissary Way",
          city: "Denver",
          region: "CO",
          postalCode: "80202",
          countryCode: "us",
          timeZone: "America/Denver",
        });
        await w.run.events(M.Event_configureTiming, {
          docId: id.golden,
          version: await versionOf(w, id.golden),
          serviceStartsAt: WEEK.golden.startsAt,
          setupMinutes: ROUTE.setup,
          loadMinutes: ROUTE.load,
          cleanupMinutes: ROUTE.cleanup,
          unloadMinutes: ROUTE.unload,
        });
        await action(w.roles.events, api.eventRoutes.refreshEventRoute, {
          eventId: id.golden,
        });

        // The drive was asked from the kitchen to the typed venue address.
        expect(google.requests.length).toBeGreaterThan(0);
        expect(google.requests[0].body.origin.address).toContain(
          "100 Commissary Way",
        );
        expect(google.requests[0].body.destination.address).toContain(
          QUOTE.venueAddress,
        );
        // Provenance: the stored fact names provider, origin, destination,
        // the answer and when it was fetched.
        const stored = await w.owner.run(async (ctx) =>
          ctx.db.query("manifestEvents").collect(),
        );
        const routeFacts = (
          stored as unknown as {
            entity: string;
            entityId: string;
            payload: { fact?: Record<string, unknown> };
          }[]
        )
          .filter(
            (row) =>
              row.entity === "EventRoute" &&
              row.entityId === id.golden &&
              row.payload.fact,
          )
          .map((row) => row.payload.fact!);
        const outbound = routeFacts.find((fact) => fact.leg === "outbound")!;
        expect(outbound).toMatchObject({
          provider: "google_routes",
          durationSeconds: ROUTE.driveSeconds,
          distanceMeters: 31_500,
        });
        expect((outbound.origin as { kind: string }).kind).toBe(
          "operating_location",
        );
        expect(outbound.fetchedAt).toBeTruthy();

        // Every milestone, worked out exactly from serve time and the route.
        const ev = (await w.roles.events.query(api.queries.getEvent, {
          id: id.golden,
        } as never)) as Record<string, number | null>;
        const drive = ROUTE.driveSeconds / 60;
        expect(ev.timingOutboundTravelMinutes).toBe(drive);
        expect(ev.timingReturnTravelMinutes).toBe(drive);
        const buffer = ev.timingSafetyBufferMinutes ?? 0;
        const briefing = ev.timingBriefingMinutes ?? 0;
        const serve = WEEK.golden.startsAt;
        const onsite = serve - ROUTE.setup * MIN;
        const depart = onsite - (drive + buffer) * MIN;
        const load = depart - ROUTE.load * MIN;
        const leaveVenue = WEEK.golden.endsAt + ROUTE.cleanup * MIN;
        const back = leaveVenue + drive * MIN;
        expect(ev.serviceStartsAt).toBe(serve);
        expect(ev.timingOnsiteAt).toBe(onsite);
        expect(ev.timingDepartShopAt).toBe(depart);
        expect(ev.timingLoadStartAt).toBe(load);
        expect(ev.timingStaffOnAt).toBe(load - briefing * MIN);
        expect(ev.timingDepartVenueAt).toBe(leaveVenue);
        expect(ev.timingReturnShopAt).toBe(back);
        expect(ev.timingStaffOffAt).toBe(back + ROUTE.unload * MIN);
      } finally {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
      }
    },
    LONG,
  );

  it(
    "golden event 06: Verify exactly one active Event menu set, ingredient contribution per source, demand line per compatible event/ingredient/unit, invoice draft, pack list, and intended staffing/prep records",
    async () => {
      // One menu set: the two lines added before acceptance, no copies.
      const dishes = await eventRows<{
        tenantId: string;
        dishId: string;
      }>(w, "eventDishes", id.golden);
      expect(dishes.map((d) => d.dishId).sort()).toEqual(
        w.catalog.dishIds.slice(0, 2).sort(),
      );

      const demands = await eventRows<{
        tenantId: string;
        ingredientId: string;
        requiredQuantity: number;
        unit: string;
      }>(w, "ingredientDemands", id.golden);
      const [flourId, saltId] = w.catalog.ingredientIds;
      expect(demands.map((d) => d.ingredientId).sort()).toEqual(
        [flourId, saltId].sort(),
      );
      const flour = demands.find((d) => d.ingredientId === flourId)!;
      expect(flour.requiredQuantity).toBeCloseTo(
        FACTS.flourPerServing * FACTS.headcount,
        4,
      );

      // One contribution per source: each dish line's recipe ingredient,
      // carrying its own servings and quantity.
      const contributions = await eventRows<{
        tenantId: string;
        eventDishId: string;
        ingredientId: string;
        servings: number;
        quantity: number;
        supersededAt: number | null;
      }>(w, "eventIngredientContributions", id.golden);
      expect(
        contributions
          .filter((c) => c.supersededAt == null)
          .map((c) => `${c.eventDishId}:${c.ingredientId}:${c.servings}`)
          .sort(),
      ).toEqual(
        [
          `${id.breadLine}:${flourId}:${FACTS.headcount}`,
          `${id.saltLine}:${saltId}:${FACTS.headcount}`,
        ].sort(),
      );

      const invoices = await eventRows<{ tenantId: string; status: string }>(
        w,
        "invoices",
        id.golden,
      );
      expect(invoices.map((i) => i.status)).toEqual(["draft"]);
      expect(await eventRows(w, "packLists", id.golden)).toHaveLength(1);
    },
    LONG,
  );

  it(
    "golden event 07: Include fries-in-cones, Caesar dressing on the side, full-service buffet, outside rentals, client-provided china, bar service, a soft-surface venue, and a rain plan",
    async () => {
      const rule = (r: Record<string, unknown>) =>
        w.run.logistics(M.PackRule_createViaDefine, r);
      const noteDish = async (name: string, note: string) => {
        const dish = await w.run.kitchen(M.Dish_createViaIntroduce, {
          name,
          portionSize: 1,
          portionUnit: "portion",
        });
        return (
          await w.run.events(M.EventDish_createViaAddToEvent, {
            eventId: id.golden,
            dishId: dish.docId,
            quantityServings: FACTS.headcount,
            specialInstructions: note,
          })
        ).docId;
      };
      // The company's packing rules (set up once, used by every event).
      await rule({
        trigger: "production_note",
        matchText: "in cones",
        description: "Paper cones",
        category: "disposable",
        scaleBy: "servings",
        perUnits: 1,
        baseQuantity: 0,
        sparePercent: 10,
        returnRequired: false,
      });
      for (const description of ["Souffle cup", "Souffle lid"])
        await rule({
          trigger: "production_note",
          matchText: "on the side",
          description,
          category: "disposable",
          scaleBy: "servings",
          perUnits: 1,
          baseQuantity: 0,
          returnRequired: false,
        });
      await rule({
        trigger: "production_note",
        matchText: "on the side",
        description: "Dressing ladle",
        category: "utensil",
        baseQuantity: 1,
      });
      await rule({
        trigger: "event_fact",
        matchFact: "barService",
        matchText: "bar",
        description: "Bar tool kit",
        category: "bar",
        baseQuantity: 1,
      });
      await rule({
        trigger: "event_fact",
        matchFact: "venueSurface",
        matchText: "grass",
        description: "Flooring panels",
        category: "flooring",
        baseQuantity: 8,
        requiredCapability: true,
      });
      await rule({
        trigger: "event_fact",
        matchFact: "rainPlan",
        description: "Tarps",
        category: "weather",
        baseQuantity: 4,
      });
      await rule({
        trigger: "event_fact",
        matchFact: "tentAndFlooring",
        description: "Frame tent",
        category: "weather",
        baseQuantity: 1,
      });
      await rule({
        trigger: "event_fact",
        matchFact: "handwashing",
        description: "Handwashing station",
        category: "handwashing",
        baseQuantity: 1,
      });
      const buffet = await w.run.owner(M.ServiceStyle_createViaRegister, {
        name: "Full Service Buffet",
        code: "FSB",
      });
      await w.run.logistics(M.ServiceStyleKitItem_createViaAdd, {
        serviceStyleId: buffet.docId,
        description: "Chafing dish",
        guestsPerUnit: 10,
        sparePercent: 20,
      });
      await w.run.logistics(M.ServiceStyleKitItem_createViaAdd, {
        serviceStyleId: buffet.docId,
        description: "China dinner plate",
        guestsPerUnit: 1,
      });

      // The event's own facts.
      id.friesLine = await noteDish("Golden fries", "Fries in cones");
      id.caesarLine = await noteDish("Golden Caesar", "Dressing on the side");
      await w.run.events(M.Event_changeServiceStyle, {
        docId: id.golden,
        serviceStyleId: buffet.docId,
        serviceStyleName: "Full Service Buffet",
        version: await versionOf(w, id.golden),
      });
      await w.run.events(M.Event_updateDaySheet, {
        docId: id.golden,
        barService: "Full bar - Mangia",
        version: await versionOf(w, id.golden),
      });
      await w.run.events(M.Event_updateSetupNotes, {
        docId: id.golden,
        venueSurface: "Grass lawn",
        rainPlan: "Tent on standby",
        tentAndFlooring: "20x40 frame tent",
        handwashing: "Yes, none on site",
        version: await versionOf(w, id.golden),
      });
      const chargers = await w.run.logistics(M.Equipment_createViaRegister, {
        name: "Gold charger",
        assetTag: "GC-100",
        category: "place_setting",
        ownership: "rented",
        quantity: 200,
      });
      await w.proof.executeCommand(
        w.roles.logistics,
        api.equipmentCheckout.reserve,
        {
          equipmentId: chargers.docId,
          eventId: id.golden,
          startsAt: WEEK.golden.startsAt,
          endsAt: WEEK.golden.endsAt,
          quantity: FACTS.headcount,
        } as never,
      );
      const truck = await w.run.owner(M.Vehicle_createViaRegister, {
        make: "Isuzu",
        model: "NPR",
        registration: "GOLD-1",
        ownership: "owned",
        payloadCapacityKg: 3000,
        operationalStatus: "available",
      });
      id.truckRun = (
        await w.run.owner(M.EventVehicleAssignment_createViaAssign, {
          eventId: id.golden,
          vehicleId: truck.docId,
        })
      ).docId;

      const { lines } = await goldenPack(w, id.golden);
      const qty = (d: string) => packLine(lines, d).requiredQuantity;
      expect(qty("Paper cones")).toBe(88); // 80 servings + 10% spare
      expect(qty("Souffle cup")).toBe(FACTS.headcount);
      expect(qty("Souffle lid")).toBe(FACTS.headcount);
      expect(qty("Dressing ladle")).toBe(1);
      expect(qty("Chafing dish")).toBe(10); // 80 / 10 + 20%
      expect(qty("Bar tool kit")).toBe(1);
      expect(qty("Flooring panels")).toBe(8);
      expect(qty("Tarps")).toBe(4);
      expect(qty("Frame tent")).toBe(1);
      expect(qty("Handwashing station")).toBe(1);
      expect(packLine(lines, "Gold charger")).toMatchObject({
        requiredQuantity: FACTS.headcount,
        ownership: "rented",
        returnRequired: true,
      });

      // The client brings their own china: the kit's plates stay listed but
      // are not packed, so Mangia never sends a duplicate.
      const plates = packLine(lines, "China dinner plate");
      await w.run.logistics(M.PackListItem_exclude, {
        docId: plates._id,
        version: plates.version,
        reason: "Client brings their own china",
        coveredBy: "client",
      });
      const after = await goldenPack(w, id.golden);
      expect(packLine(after.lines, "China dinner plate")).toMatchObject({
        excludedAt: expect.any(Number),
        coveredBy: "client",
      });
      // One truck booked for the event.
      expect(
        await eventRows(w, "eventVehicleAssignments", id.golden),
      ).toHaveLength(1);

      // The proposal's service style and rentals sections name their records.
      const report = (await w.roles.sales.query(
        api.lib.proposalDraftReport.getProposalDraftReport,
        { proposalId: id.proposal } as never,
      )) as {
        sections: { key: string; sources: { table: string; id: string }[] }[];
      };
      const section = (key: string) =>
        report.sections.find((s) => s.key === key)?.sources ?? [];
      expect(section("service")).toEqual([
        { table: "serviceStyles", id: buffet.docId },
      ]);
      expect(section("rentals").map((s) => s.table)).toEqual([
        "equipmentReservations",
      ]);
      for (const s of report.sections)
        expect(s.sources.length, s.key).toBeGreaterThan(0);
    },
    LONG,
  );

  it(
    "golden event 08: Verify reference, warehouse-category, vehicle/load, and return views contain the same underlying line identities and totals",
    async () => {
      let { packListId, lines } = await goldenPack(w, id.golden);
      for (const description of ["Gold charger", "Flooring panels"]) {
        const row = packLine(lines, description);
        await w.run.logistics(M.PackListItem_assignLoad, {
          docId: row._id,
          version: row.version,
          loadAssignmentId: id.truckRun,
        });
      }
      const ctx = {
        dishName: () => "A dish",
        rigs: [{ id: id.truckRun, label: "Isuzu NPR" }],
      };
      const views = (rows: PackLine[]) =>
        Object.fromEntries(
          (["all", "reference", "warehouse", "load", "returns"] as const).map(
            (kind) => [kind, packView(kind, rows, ctx).flatMap((g) => g.lines)],
          ),
        ) as Record<PackViewKind, PackLine[]>;
      const ids = (rows: PackLine[]) => rows.map((r) => r._id).sort();
      const total = (rows: PackLine[]) =>
        rows.reduce((sum, r) => sum + r.requiredQuantity, 0);

      ({ lines } = await goldenPack(w, id.golden));
      let v = views(lines);
      expect(ids(v.reference)).toEqual(ids(v.all));
      expect(ids(v.warehouse)).toEqual(ids(v.all));
      expect(total(v.reference)).toBe(total(v.all));
      expect(total(v.warehouse)).toBe(total(v.all));
      const going = v.all.filter((r) => r.excludedAt == null);
      expect(ids(v.load)).toEqual(ids(going));
      expect(total(v.load)).toBe(total(going));
      for (const row of v.returns) expect(ids(going)).toContain(row._id);
      expect(ids(v.returns)).toContain(packLine(lines, "Gold charger")._id);
      const truckGroup = packView("load", lines, ctx).find(
        (g) => g.key === `rig:${id.truckRun}`,
      )!;
      // One truck on the event: everything going rides on it.
      expect(ids(truckGroup.lines)).toEqual(ids(going));
      expect(packLine(lines, "Gold charger").loadAssignmentId).toBe(
        id.truckRun,
      );

      // Packing counted from one view shows in every view: they all read
      // the same row.
      await w.run.logistics(M.PackList_startPacking, {
        docId: packListId,
        version: await versionOf(w, packListId),
      });
      const tarps = packLine(lines, "Tarps");
      await w.run.logistics(M.PackListItem_recordPackedCount, {
        docId: tarps._id,
        version: tarps.version,
        packedQuantity: 2,
        idempotencyKey: "golden-pack-tarps",
      });
      ({ lines } = await goldenPack(w, id.golden));
      v = views(lines);
      for (const kind of ["all", "reference", "warehouse", "load", "returns"])
        expect(
          v[kind as PackViewKind].find((r) => r._id === tarps._id)
            ?.packedQuantity,
          kind,
        ).toBe(2);
    },
    LONG,
  );

  it(
    "golden event 09: Evaluate every Final Lock office question",
    async () => {
      const report = (await w.roles.events.query(
        api.lib.eventPacket.finalLock.getFinalLock,
        { eventId: id.golden } as never,
      )) as {
        outcome: string;
        answers: {
          questionKey: string;
          group: string;
          result: string;
          value: unknown;
          missing: string[];
          action: string | null;
          sources: unknown[];
          fieldWork: { confirmedAt: string | null } | null;
        }[];
      };
      const office = report.answers.filter((a) => a.group !== "field");
      const field = report.answers.filter((a) => a.group === "field");
      expect(office.length).toBeGreaterThan(30);
      // Every office question is answered, not applicable, or names exactly
      // what is missing and the one step that settles it.
      for (const a of office) {
        expect(
          ["answered", "not_applicable", "unresolved"],
          a.questionKey,
        ).toContain(a.result);
        if (a.result === "unresolved") {
          expect(a.missing.length, a.questionKey).toBeGreaterThan(0);
          expect(a.action, a.questionKey).toBeTruthy();
        } else if (a.result === "answered")
          expect(a.sources.length, a.questionKey).toBeGreaterThan(0);
      }
      const at = (key: string) =>
        report.answers.find((a) => a.questionKey === key)!;
      expect(at("identity.guest_count").value).toEqual({
        type: "count",
        count: FACTS.headcount,
      });
      expect(at("identity.service_style").value).toEqual({
        type: "choice",
        choice: "Full Service Buffet",
      });
      expect(at("setup.rain_plan").result).toBe("answered");
      expect(at("setup.venue_surface").result).toBe("answered");
      expect(at("timeline.route").result).toBe("answered");
      // Chargers are rented and the client brings the china: no Mangia
      // china is promised twice.
      const pieces = (at("servingware.source").value as { items: string[] })
        .items;
      expect(pieces).toEqual(
        expect.arrayContaining(["Rented pieces", "Client-provided pieces"]),
      );
      expect(pieces).not.toContain("Mangia pieces");
      // The inquiry's dietary note is not passed off as load-in notes.
      expect(at("setup.load_in")).toMatchObject({
        result: "unresolved",
        missing: ["No load-in notes on the venue or the event."],
      });
      expect(at("rentals.return")).toMatchObject({
        result: "unresolved",
        missing: ["This event has rentals but nobody is named to return them."],
      });
      // Day-of work stays open until named people do it on the day.
      expect(field.length).toBeGreaterThan(0);
      for (const a of field) {
        expect(a.result, a.questionKey).toBe("field_confirmation");
        expect(a.fieldWork?.confirmedAt ?? null, a.questionKey).toBeNull();
      }
      expect(report.outcome).toBe("needs_review");

      // Open office questions show on the event's readiness list.
      const readiness = (await w.roles.events.query(
        api.eventReadiness.getEventReadiness,
        { eventId: id.golden } as never,
      )) as { issues?: { code: string }[] } | null;
      expect(JSON.stringify(readiness)).toContain(
        "packet.final_lock_needs_review",
      );
    },
    LONG,
  );

  it(
    "golden event 10: Prepare the event packet and verify its eight required sections",
    async () => {
      await w.run.events(M.Event_setEventNumber, {
        docId: id.golden,
        eventNumber: "7001",
        version: await versionOf(w, id.golden),
      });
      await w.run.events(M.Event_updateSetupNotes, {
        docId: id.golden,
        venueSurface: "Grass lawn",
        rainPlan: "Tent on standby",
        tentAndFlooring: "20x40 frame tent",
        handwashing: "Yes, none on site",
        setupDiagram: "Buffet along the tent's north side, bar by the gate",
        version: await versionOf(w, id.golden),
      });
      const lead = await seedCrew(w, "Lena", "555-0101");
      const server = await seedCrew(w, "Sam", "555-0199");
      crew.lead = lead;
      crew.server = server;
      const callAt = WEEK.golden.startsAt - 4 * 60 * MIN;
      for (const [person, role] of [
        [lead, "Event lead"],
        [server, "Server"],
      ] as const)
        await w.run.owner(M.EventAssignment_createViaAssign, {
          eventId: id.golden,
          personId: person.personId,
          role,
          startsAt: callAt,
          endsAt: WEEK.golden.endsAt,
        });

      const packet = anyApi.lib.eventPacket.commands;
      const p = (await w.owner.query(packet.getPacket, {
        eventId: id.golden,
      })) as PacketRead;
      const book = buildWorkbook(p.snapshot, { finalLock: p.finalLock.lines });
      const sectionIds = book.sections.map((s) => s.id);
      const order = [
        "brief",
        "menu",
        "packlist-item",
        "packlist-category",
        "forms",
        "staffing",
        "equipment",
        "venue",
      ];
      const at = (sid: string) => sectionIds.indexOf(sid);
      for (const sid of order) expect(at(sid), sid).toBeGreaterThanOrEqual(0);
      expect(order.map(at)).toEqual([...order.map(at)].sort((a, b) => a - b));
      const part = (sid: string) =>
        book.sections
          .find((s) => s.id === sid)!
          .blocks.map((b) => b.text)
          .join("\n");

      // Printable binder instruction, on the event's own number.
      expect(p.snapshot.identity.invoiceNumber).toBe("7001");
      expect(part("brief")).toContain("Event 7001 goes on the spine");
      expect(part("brief")).not.toContain("Two vegetarian guests");
      // A native event has no imported paperwork to reconcile.
      for (const importCheck of [
        "tray, salad and roll",
        "original units",
        "recipe placeholders",
        "TPP Final Approval",
      ])
        expect(part("cover")).not.toContain(importCheck);
      expect(part("menu")).toContain("Golden Caesar - 80 servings");
      expect(part("packlist-category")).toContain("[ ] Paper cones - 88 each");
      // Staff call times.
      const staff = part("staffing");
      expect(staff).toContain("Lena Crew - Event lead | call ");
      expect(staff).toContain("Sam Crew - Server | call ");
      // Rental pull sheet: rented chargers go back to the rental company.
      const pull = part("equipment");
      expect(pull).toContain("Gold charger - 80 each | back: Back to");
      expect(pull).not.toContain("Gold charger - 80 each | back: Our crew");
      // Route, map and setup drawing.
      const route = part("venue");
      expect(route).toContain("Venue: 4 Orchard Road");
      expect(route).toContain(
        "https://www.google.com/maps/search/?api=1&query=4%20Orchard%20Road",
      );
      expect(route).toContain("Truck run: Isuzu NPR GOLD-1");
      expect(route).toContain(
        "Setup: Setup diagram - Buffet along the tent's north side, bar by the gate",
      );

      // Printed: the stored revision matches the current sources.
      const doc = await PDFDocument.create();
      doc.addPage();
      const pdf = await action<{ storageId: string }>(
        w.owner,
        packet.uploadPacketFile,
        {
          eventId: id.golden,
          bytes: (await doc.save()).buffer,
          name: "workbook.pdf",
          mimeType: "application/pdf",
          purpose: "pdf",
          inputFingerprint: p.currentFingerprint,
          finalLockFingerprint: p.finalLockFingerprint,
        },
      );
      const snap = await action<{ storageId: string }>(
        w.owner,
        packet.uploadPacketFile,
        {
          eventId: id.golden,
          bytes: new TextEncoder().encode(
            JSON.stringify({ ...p.snapshot, finalLock: p.finalLock }),
          ).buffer,
          name: "snapshot.json",
          mimeType: "application/json",
          purpose: "snapshot",
        },
      );
      await w.owner.mutation(packet.recordPacketRevision, {
        eventId: id.golden,
        inputFingerprint: p.currentFingerprint,
        finalLockFingerprint: p.finalLockFingerprint,
        pdfStorageId: pdf.storageId,
        snapshotStorageId: snap.storageId,
      });
      const fresh = (await w.owner.query(packet.getPacket, {
        eventId: id.golden,
      })) as PacketRead;
      expect(fresh.latestRevision.stale).toBe(false);
      expect(fresh.latestRevision.staleSections).toEqual([]);
    },
    LONG,
  );

  it(
    "golden event 11: Allocate stock across this and another Event in the same week",
    async () => {
      await w.run.events(M.EventDish_createViaAddToEvent, {
        eventId: id.rival,
        dishId: w.catalog.dishIds[0],
        quantityServings: FACTS.rivalHeadcount,
      });
      await w.run.events(M.Event_submitForApproval, {
        docId: id.rival,
        version: await versionOf(w, id.rival),
      });
      await w.run.events(M.Event_approve, {
        docId: id.rival,
        version: await versionOf(w, id.rival),
      });
      const [order] = await drafts(w.roles.procurement, TENANT);
      const flourLine = await lineFor(
        w.roles.procurement,
        TENANT,
        order._id,
        w.catalog.ingredientIds[0],
      );
      // The 5 kg on hand is applied once across both events, never twice.
      expect(flourLine!.orderedQuantity).toBeCloseTo(
        FACTS.flourPerServing * (FACTS.headcount + FACTS.rivalHeadcount) -
          FACTS.flourStock,
        4,
      );
    },
    LONG,
  );

  it(
    "golden event 12: Verify one weekly draft order with separate Event contributions and consolidated compatible quantities",
    async () => {
      const weekDrafts = await drafts(w.roles.procurement, TENANT);
      expect(weekDrafts).toHaveLength(1);
      expect(weekDrafts[0].sourceRangeStart).toBe(WEEK.key);
      const [flourId, saltId] = w.catalog.ingredientIds;
      const flourLine = await lineFor(
        w.roles.procurement,
        TENANT,
        weekDrafts[0]._id,
        flourId,
      );
      expect(
        await linkedEventIds(w.roles.procurement, TENANT, flourLine!._id),
      ).toEqual([id.golden, id.rival].sort());
      const saltLine = await lineFor(
        w.roles.procurement,
        TENANT,
        weekDrafts[0]._id,
        saltId,
      );
      expect(
        await linkedEventIds(w.roles.procurement, TENANT, saltLine!._id),
      ).toEqual([id.golden]);
    },
    LONG,
  );

  it(
    "golden event 13: Change headcount; verify headcount-following dishes, food demand, prep, pack quantities, load rule, staffing/timeline inputs, proposal/change requirement, planning answers, and packet staleness reconcile once",
    async () => {
      // A dish served to only part of the guests keeps its own count, and a
      // pack quantity set by hand stays as set.
      const bites = await w.run.kitchen(M.Dish_createViaIntroduce, {
        name: "Golden passed bites",
        portionSize: 1,
        portionUnit: "portion",
      });
      id.bitesLine = (
        await w.run.events(M.EventDish_createViaAddToEvent, {
          eventId: id.golden,
          dishId: bites.docId,
          quantityServings: 24,
        })
      ).docId;
      let { lines } = await goldenPack(w, id.golden);
      const chafers = packLine(lines, "Chafing dish");
      await w.run.logistics(M.PackListItem_adjustQuantity, {
        docId: chafers._id,
        version: chafers.version,
        requiredQuantity: 12,
      });
      const before = (await readReconciliationReceipts(w.owner, TENANT)).length;
      await w.run.events(M.Event_changeHeadcount, {
        docId: id.golden,
        version: await versionOf(w, id.golden),
        newHeadcount: FACTS.newHeadcount,
      });
      // One receipt per affected area, each complete, none repeated.
      const all = await readReconciliationReceipts(w.owner, TENANT);
      const receipts = all.filter(
        (r) =>
          r.eventId === id.golden && r.triggerType === "EventHeadcountChanged",
      );
      expect(all.length - before).toBe(receipts.length);
      const domains = receipts.flatMap((r) => r.affectedDomains);
      expect(new Set(domains).size).toBe(domains.length);
      expect(domains.sort()).toEqual([
        "demand",
        "menu",
        "pack",
        "packet",
        "prep",
        "proposal",
        "staffing",
      ]);
      for (const receipt of receipts)
        expect(receipt.checkpoint.state).toBe("complete");

      // Following lines moved; the fixed dish and the hand-set count did not.
      expect(
        (await readRow<{ quantityServings: number }>(w.owner, id.bitesLine))
          .quantityServings,
      ).toBe(24);
      ({ lines } = await goldenPack(w, id.golden));
      expect(packLine(lines, "Chafing dish").requiredQuantity).toBe(12);
      expect(packLine(lines, "Paper cones").requiredQuantity).toBe(110);
      expect(packLine(lines, "Souffle cup").requiredQuantity).toBe(
        FACTS.newHeadcount,
      );
      // The printed packet is now out of date; the planning answer moved.
      const p = (await w.owner.query(
        anyApi.lib.eventPacket.commands.getPacket,
        { eventId: id.golden },
      )) as PacketRead;
      expect(p.latestRevision.stale).toBe(true);
      const lock = (await w.owner.query(
        api.lib.eventPacket.finalLock.getFinalLock,
        { eventId: id.golden } as never,
      )) as { answers: { questionKey: string; value: unknown }[] };
      expect(
        lock.answers.find((a) => a.questionKey === "identity.guest_count")
          ?.value,
      ).toEqual({ type: "count", count: FACTS.newHeadcount });

      const bread = await readRow<{ quantityServings: number }>(
        w.owner,
        id.breadLine,
      );
      expect(bread.quantityServings).toBe(FACTS.newHeadcount);
      const [order] = await drafts(w.roles.procurement, TENANT);
      const flourLine = await lineFor(
        w.roles.procurement,
        TENANT,
        order._id,
        w.catalog.ingredientIds[0],
      );
      expect(flourLine!.orderedQuantity).toBeCloseTo(
        FACTS.flourPerServing * (FACTS.newHeadcount + FACTS.rivalHeadcount) -
          FACTS.flourStock,
        4,
      );
    },
    LONG,
  );

  it(
    "golden event 14: Remove one dish and add another; verify removed unstarted work retires, manual overrides remain, and no duplicate demand or pack items appear",
    async () => {
      const [flourId, saltId, herbId] = w.catalog.ingredientIds;
      // A manager's own count on the bread line must survive the menu change.
      await w.run.owner(M.EventDish_setHeadcountOverride, {
        docId: id.breadLine,
        headcountOverride: FACTS.breadOverride,
      });
      const packBefore = await eventRows<{
        tenantId: string;
        _id: string;
      }>(w, "packListItems", id.golden);

      await w.run.owner(M.EventDish_remove, {
        docId: id.saltLine,
        reason: "Client swapped the salted course",
      });
      id.herbLine = (
        await w.run.events(M.EventDish_createViaAddToEvent, {
          eventId: id.golden,
          dishId: w.catalog.dishIds[2],
          quantityServings: FACTS.newHeadcount,
        })
      ).docId;

      const bread = await readRow<{ headcountOverride: number | null }>(
        w.owner,
        id.breadLine,
      );
      expect(bread.headcountOverride).toBe(FACTS.breadOverride);
      expect(
        (
          await eventRows<{ tenantId: string; _id: string }>(
            w,
            "eventDishes",
            id.golden,
          )
        )
          .map((d) => d._id)
          .sort(),
      ).toEqual(
        [
          id.breadLine,
          id.herbLine,
          id.friesLine,
          id.caesarLine,
          id.bitesLine,
        ].sort(),
      );

      // Demand: one live line per ingredient; salt retired, herb added once.
      const demands = await eventRows<{
        tenantId: string;
        ingredientId: string;
        requiredQuantity: number;
      }>(w, "ingredientDemands", id.golden);
      const live = demands.filter((d) => d.requiredQuantity > 0);
      expect(live.map((d) => d.ingredientId).sort()).toEqual(
        [flourId, herbId].sort(),
      );
      expect(new Set(demands.map((d) => d.ingredientId)).size).toBe(
        demands.length,
      );
      expect(
        demands.find((d) => d.ingredientId === saltId)?.requiredQuantity ?? 0,
      ).toBe(0);

      // The weekly order follows: salt no longer bought for this event.
      const [order] = await drafts(w.roles.procurement, TENANT);
      const saltLine = await lineFor(
        w.roles.procurement,
        TENANT,
        order._id,
        saltId,
      );
      expect(saltLine?.orderedQuantity ?? 0).toBe(0);
      const herbLine = await lineFor(
        w.roles.procurement,
        TENANT,
        order._id,
        herbId,
      );
      expect(herbLine!.orderedQuantity).toBeCloseTo(
        FACTS.herbPerServing * FACTS.newHeadcount,
        4,
      );
      expect(
        await linkedEventIds(w.roles.procurement, TENANT, herbLine!._id),
      ).toEqual([id.golden]);

      // Pack items: no line appears twice.
      const packAfter = await eventRows<{
        tenantId: string;
        _id: string;
        description?: string;
        sourceKey?: string | null;
      }>(w, "packListItems", id.golden);
      const keys = packAfter.map((p) => p.sourceKey ?? p.description ?? p._id);
      expect(new Set(keys).size).toBe(keys.length);
      expect(packAfter.length).toBeLessThanOrEqual(packBefore.length + 1);
    },
    LONG,
  );

  it(
    "golden event 15: Reschedule or change venue; verify a new route fact, old/new purchasing drafts, staffing-following windows, delivery/timeline/readiness, and packet staleness",
    async () => {
      vi.useFakeTimers();
      stubRouteEnv();
      const google = fakeRoutes(() => ROUTE.driveSeconds);
      try {
        // Ana's work follows the event; Cy's week was already sent and
        // confirmed, so his shift may only move through the correction path.
        const ana = await seedCrew(w, "Ana", "555-0111");
        const cy = await seedCrew(w, "Cy", "555-0122");
        const rows: Record<string, string> = {};
        for (const [name, person] of Object.entries({ ana, cy }))
          rows[name] = (
            await w.run.owner(M.EventAssignment_createViaAssign, {
              eventId: id.golden,
              personId: person.personId,
              role: "Server",
            })
          ).docId;
        await settle(w.raw);
        const shiftsOf = async (personId: string) =>
          (
            await liveRows<{
              tenantId: string;
              personId: string;
              status: string;
              startsAt: number;
            }>(w.owner, "shifts", TENANT)
          ).filter((s) => s.personId === personId && s.status !== "cancelled");
        const [anaBefore] = await shiftsOf(ana.personId);
        expect(anaBefore.startsAt).toEqual(expect.any(Number));
        const notice = await w.run.owner(
          M.WeeklyScheduleNotice_createViaPublishSchedule,
          {
            personId: cy.personId,
            recipientAuthSubjectId: cy.subject,
            weekStartsAt: WEEK.key,
            weekEndsAt: WEEK.key + 7 * DAY,
            shiftCount: 1,
            shiftSummary: "Wed · 1:00 PM · Server · Golden event",
          },
        );
        await w.raw
          .withIdentity({
            subject: cy.subject,
            org_id: TENANT,
            role: "event_staff",
          })
          .mutation(M.WeeklyScheduleNotice_acknowledge, {
            docId: notice.docId,
          } as never);
        await settle(w.raw);
        const factsBefore = await routeFacts();

        // The client moves the event one week later.
        await w.run.events(M.Event_reschedule, {
          docId: id.golden,
          version: await versionOf(w, id.golden),
          startsAt: WEEK.golden.startsAt + 7 * DAY,
          endsAt: WEEK.golden.endsAt + 7 * DAY,
        });
        await settle(w.raw);

        // Staffing: Ana follows, Cy waits for a manager to send the change.
        const [anaAfter] = await shiftsOf(ana.personId);
        expect(anaAfter.startsAt).toBe(anaBefore.startsAt + 7 * DAY);
        const [cyBefore] = await shiftsOf(cy.personId);
        const changes = (await w.owner.query(
          api.shiftTimingChanges.listEventShiftChanges,
          { eventId: id.golden } as never,
        )) as {
          proposalId: string;
          personName: string;
          acknowledged: boolean;
          to: { startsAt: number };
        }[];
        const cyChange = changes.find((c) => c.personName === "Cy Crew")!;
        expect(cyChange.acknowledged).toBe(true);
        expect(cyChange.to.startsAt).toBe(cyBefore.startsAt + 7 * DAY);
        await w.owner.mutation(api.shiftTimingChanges.applyShiftTimingChange, {
          proposalId: cyChange.proposalId,
          shiftSummary: "Wed · 1:00 PM · Server · Golden event (moved)",
        } as never);
        const [cyAfter] = await shiftsOf(cy.personId);
        expect(cyAfter.startsAt).toBe(cyBefore.startsAt + 7 * DAY);
        const resent = await readRow<{ acknowledgedAt: number | null }>(
          w.owner,
          notice.docId,
        );
        expect(resent.acknowledgedAt ?? null).toBeNull();

        // Purchasing: the golden event's food moved to the new week's draft;
        // the competing event stays on the old week's draft.
        const weekDrafts = await drafts(w.roles.procurement, TENANT);
        const oldWeek = weekDrafts.find(
          (d) => d.sourceRangeStart === WEEK.key,
        )!;
        const newWeek = weekDrafts.find(
          (d) => d.sourceRangeStart === WEEK.key + 7 * DAY,
        )!;
        expect(oldWeek).toBeDefined();
        expect(newWeek).toBeDefined();
        const flourId = w.catalog.ingredientIds[0];
        const oldFlour = await lineFor(
          w.roles.procurement,
          TENANT,
          oldWeek._id,
          flourId,
        );
        expect(
          await linkedEventIds(w.roles.procurement, TENANT, oldFlour!._id),
        ).toEqual([id.rival]);
        const newFlour = await lineFor(
          w.roles.procurement,
          TENANT,
          newWeek._id,
          flourId,
        );
        expect(
          await linkedEventIds(w.roles.procurement, TENANT, newFlour!._id),
        ).toEqual([id.golden]);

        // Timeline follows the new serve time.
        const ev = (await w.roles.events.query(api.queries.getEvent, {
          id: id.golden,
        } as never)) as Record<string, number | null>;
        expect(ev.serviceStartsAt).toBe(WEEK.golden.startsAt + 7 * DAY);
        expect(ev.timingOnsiteAt).toBe(
          WEEK.golden.startsAt + 7 * DAY - ROUTE.setup * MIN,
        );
        // A new route fact for the new date.
        expect((await routeFacts()).length).toBeGreaterThan(factsBefore.length);
        expect(google.requests.length).toBeGreaterThan(0);

        // The printed packet is out of date, and readiness says so.
        const p = (await w.owner.query(
          anyApi.lib.eventPacket.commands.getPacket,
          { eventId: id.golden },
        )) as PacketRead;
        expect(p.latestRevision.stale).toBe(true);
        const readiness = JSON.stringify(
          await w.roles.events.query(api.eventReadiness.getEventReadiness, {
            eventId: id.golden,
          } as never),
        );
        expect(readiness).toContain("packet.out_of_date");
      } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
      }
    },
    LONG,
  );
});

describe.sequential(
  "golden event journey, day-of facts (AC-668..AC-674)",
  () => {
    it(
      "golden event 16: Partially receive an order, partially complete prep, pack items, acknowledge/clock in staff, and record time/waste",
      async () => {
        const [flourId] = w.catalog.ingredientIds;
        const buyer = w.roles.procurement;
        const buy = (
          cmd: Parameters<World["run"]["owner"]>[0],
          args: Record<string, unknown>,
        ) => w.proof.executeCommand(buyer, cmd, args as never);

        // The new week's order goes out and half the flour arrives.
        const order = (await drafts(buyer, TENANT)).find(
          (d) => d.sourceRangeStart === WEEK.key + 7 * DAY,
        )!;
        facts.orderId = order._id;
        await buy(M.VendorOrder_submit, {
          docId: order._id,
          version: await versionOf(w, order._id),
        });
        await buy(M.VendorOrder_confirm, {
          docId: order._id,
          version: await versionOf(w, order._id),
        });
        const flourLine = (await lineFor(buyer, TENANT, order._id, flourId))!;
        facts.orderedFlour = flourLine.orderedQuantity;
        facts.flourLineId = flourLine._id;
        await buy(M.VendorOrderLine_recordReceipt, {
          docId: flourLine._id,
          quantity: flourLine.orderedQuantity / 2,
          locationId: w.catalog.locationId,
          unitPrice: 2,
          supplierLotNumber: "GOLD-LOT-1",
        });
        await buy(M.VendorOrder_markPartiallyReceived, { docId: order._id });
        expect(
          (await readRow<{ status: string }>(w.owner, order._id)).status,
        ).toBe("partially_received");
        const lots = (
          await liveRows<{
            tenantId: string;
            vendorOrderLineId: string;
            receiptQuantity: number;
          }>(w.owner, "inventoryLots", TENANT)
        ).filter((lot) => lot.vendorOrderLineId === flourLine._id);
        expect(lots.map((lot) => lot.receiptQuantity)).toEqual([
          flourLine.orderedQuantity / 2,
        ]);

        // The bread recipe gains its prep steps; the kitchen finishes one.
        for (const name of ["Mix dough", "Bake rolls"])
          await w.run.kitchen(M.DishTask_createViaAdd, {
            dishId: w.catalog.dishIds[0],
            name,
            defaultQuantity: 1,
            defaultUnit: "portion",
            station: "Bakery",
          });
        const prep = await eventRows<{
          tenantId: string;
          _id: string;
          eventDishId: string;
          name: string;
          quantity: number;
          status: string;
        }>(w, "prepTasks", id.golden);
        const breadPrep = prep.filter((p) => p.eventDishId === id.breadLine);
        expect(breadPrep.map((p) => p.name).sort()).toEqual([
          "Bake rolls",
          "Mix dough",
        ]);
        const dough = breadPrep.find((p) => p.name === "Mix dough")!;
        await w.run.kitchen(M.PrepTask_assign, {
          docId: dough._id,
          personId: crew.lead.personId,
        });
        await w.run.kitchen(M.PrepTask_start, { docId: dough._id });
        await w.run.kitchen(M.PrepTask_complete, {
          docId: dough._id,
          completedQuantity: dough.quantity,
        });
        facts.doughId = dough._id;
        facts.doughQuantity = dough.quantity;

        // Packing goes on.
        let { lines } = await goldenPack(w, id.golden);
        const cups = packLine(lines, "Souffle cup");
        await w.run.logistics(M.PackListItem_recordPackedCount, {
          docId: cups._id,
          version: cups.version,
          packedQuantity: 40,
          idempotencyKey: "golden-pack-cups",
        });
        ({ lines } = await goldenPack(w, id.golden));
        expect(packLine(lines, "Souffle cup").packedQuantity).toBe(40);

        // Ana confirms her shift and clocks in from her phone.
        const ana = (
          await liveRows<{
            tenantId: string;
            _id: string;
            givenName: string;
          }>(w.owner, "people", TENANT)
        ).find((p) => p.givenName === "Ana")!;
        const anaSelf = w.proof.asRole({
          subject: `crew-ana-${TENANT}`,
          role: "event_staff",
          tenantId: TENANT,
        });
        const assignment = (
          await eventRows<{ tenantId: string; _id: string; personId: string }>(
            w,
            "eventAssignments",
            id.golden,
          )
        ).find((a) => a.personId === ana._id)!;
        await w.proof.executeCommand(anaSelf, M.EventAssignment_confirm, {
          docId: assignment._id,
          version: await versionOf(w, assignment._id),
        } as never);
        const shift = (
          await liveRows<{ tenantId: string; _id: string; personId: string }>(
            w.owner,
            "shifts",
            TENANT,
          )
        ).find((s) => s.personId === ana._id)!;
        const clock = (await w.proof.executeCommand(
          anaSelf,
          M.TimeRecord_createViaClockIn,
          {
            personId: ana._id,
            shiftId: shift._id,
            timeZone: "America/Denver",
            idempotencyKey: "golden-ana-clock-in",
          } as never,
        )) as { docId: string };
        facts.clockInId = clock.docId;
        const record = await readRow<{ eventId: string; status: string }>(
          w.owner,
          clock.docId,
        );
        expect(record).toMatchObject({ eventId: id.golden, status: "open" });

        // Spoiled flour is written off against the event.
        const flourStock = (
          await liveRows<{
            tenantId: string;
            _id: string;
            ingredientId: string;
          }>(w.owner, "inventoryItems", TENANT)
        ).find((item) => item.ingredientId === flourId)!;
        facts.wasteId = (
          (await w.proof.executeCommand(
            w.roles.inventory,
            M.WasteRecord_createViaRecord,
            {
              ingredientId: flourId,
              locationId: w.catalog.locationId,
              inventoryItemId: flourStock._id,
              quantity: 0.5,
              unit: "kilogram",
              reason: "spoilage",
              unitCost: 2,
              eventId: id.golden,
            } as never,
          )) as { docId: string }
        ).docId;
        expect(
          await readRow<{ eventId: string; quantity: number }>(
            w.owner,
            facts.wasteId,
          ),
        ).toMatchObject({ eventId: id.golden, quantity: 0.5 });
      },
      LONG,
    );

    it(
      "golden event 17: Change the Event again; verify committed actuals remain and only remaining work/deltas change",
      async () => {
        const herbId = w.catalog.ingredientIds[2];
        const buyer = w.roles.procurement;
        const before = {
          herbOrdered: (await lineFor(buyer, TENANT, facts.orderId, herbId))!
            .orderedQuantity,
          flourOrdered: (await lineFor(
            buyer,
            TENANT,
            facts.orderId,
            w.catalog.ingredientIds[0],
          ))!.orderedQuantity,
          clock: await readRow<Record<string, unknown>>(
            w.owner,
            facts.clockInId,
          ),
          waste: await readRow<Record<string, unknown>>(w.owner, facts.wasteId),
          lots: await liveRows<{ tenantId: string; _id: string }>(
            w.owner,
            "inventoryLots",
            TENANT,
          ),
        };
        await w.run.events(M.Event_changeHeadcount, {
          docId: id.golden,
          version: await versionOf(w, id.golden),
          newHeadcount: FACTS.secondHeadcount,
        });

        // What was ordered, received, cooked, clocked and wasted stays.
        expect(
          (await lineFor(buyer, TENANT, facts.orderId, herbId))!
            .orderedQuantity,
        ).toBe(before.herbOrdered);
        expect(
          (await lineFor(
            buyer,
            TENANT,
            facts.orderId,
            w.catalog.ingredientIds[0],
          ))!.orderedQuantity,
        ).toBe(before.flourOrdered);
        expect(await readRow(w.owner, facts.clockInId)).toEqual(before.clock);
        expect(await readRow(w.owner, facts.wasteId)).toEqual(before.waste);
        expect(
          await liveRows<{ tenantId: string; _id: string }>(
            w.owner,
            "inventoryLots",
            TENANT,
          ),
        ).toEqual(before.lots);
        const dough = await readRow<{
          status: string;
          completedQuantity: number;
        }>(w.owner, facts.doughId);
        expect(dough).toMatchObject({
          status: "completed",
          completedQuantity: facts.doughQuantity,
        });
        const { lines } = await goldenPack(w, id.golden);
        expect(packLine(lines, "Souffle cup")).toMatchObject({
          packedQuantity: 40,
          requiredQuantity: FACTS.secondHeadcount,
        });

        // Only the extra herb for the 20 new guests goes on a new draft.
        const delta = (await drafts(buyer, TENANT)).find(
          (d) => d.sourceRangeStart === WEEK.key + 7 * DAY,
        )!;
        expect(delta._id).not.toBe(facts.orderId);
        const extraHerb = (await lineFor(buyer, TENANT, delta._id, herbId))!;
        expect(extraHerb.orderedQuantity).toBeCloseTo(
          FACTS.herbPerServing * (FACTS.secondHeadcount - FACTS.newHeadcount),
          4,
        );
      },
      LONG,
    );
  },
);

describe.sequential(
  "golden event journey, the day and after (AC-670..AC-674)",
  () => {
    it(
      "golden event 18: Require named people to perform the before-takeoff and arrival confirmations. Prove Capsule cannot auto-complete them",
      async () => {
        const fl = api.lib.eventPacket.finalLock as unknown as Record<
          string,
          never
        >;
        const report = async () =>
          (await w.owner.query(fl.getFinalLock, {
            eventId: id.golden,
          } as never)) as {
            answers: {
              questionKey: string;
              basis: string;
              fieldWork: {
                status: string;
                confirmedAt: string | null;
                confirmedBy: string | null;
              } | null;
            }[];
          };
        const answerOf = async (key: string) =>
          (await report()).answers.find((a) => a.questionKey === key)!;
        expect(
          await w.owner.mutation(fl.prepareFieldForms, {
            eventId: id.golden,
          } as never),
        ).toEqual({ prepared: 10 });
        // Running it again sets up nothing new and signs nothing.
        expect(
          await w.owner.mutation(fl.prepareFieldForms, {
            eventId: id.golden,
          } as never),
        ).toEqual({ prepared: 0 });
        // The office cannot answer a day-of form for the crew.
        await expect(
          w.owner.mutation(fl.overrideFinalLockAnswer, {
            eventId: id.golden,
            questionKey: "field.arrival",
            basedOn: (await answerOf("field.arrival")).basis,
            answer: "Done",
            reason: "Office says so",
          } as never),
        ).rejects.toThrow(/person who does it/);
        for (const key of ["field.arrival", "field.takeoff-readiness"])
          expect((await answerOf(key)).fieldWork).toMatchObject({
            status: "open",
            confirmedAt: null,
          });

        const forms = Object.fromEntries(
          (
            (await w.owner.query(fl.listEventFieldForms, {
              eventId: id.golden,
            } as never)) as { formKey: string; id: string }[]
          ).map((row) => [row.formKey, row.id]),
        );
        const as = (subject: string) =>
          w.raw.withIdentity({ subject, org_id: TENANT, role: "event_staff" });
        const lena = as(crew.lead.subject);
        const sam = as(crew.server.subject);

        // Before takeoff: two different people, each for themselves.
        await lena.mutation(M.FieldConfirmation_complete, {
          docId: forms["field.takeoff-readiness"],
          outcome: "all_good",
        } as never);
        await expect(
          lena.mutation(M.FieldConfirmation_countersign, {
            docId: forms["field.takeoff-readiness"],
          } as never),
        ).rejects.toThrow(/second, different person/);
        expect(
          (await answerOf("field.takeoff-readiness")).fieldWork,
        ).toMatchObject({ status: "first_signed", confirmedAt: null });
        await sam.mutation(M.FieldConfirmation_countersign, {
          docId: forms["field.takeoff-readiness"],
          note: "Straps on, doors locked",
        } as never);
        expect(
          (await answerOf("field.takeoff-readiness")).fieldWork,
        ).toMatchObject({
          status: "done",
          confirmedBy: "Lena Crew and Sam Crew",
        });

        // Arrival: signed by the lead with the time it really happened.
        const seenAt = Date.now() - 5 * MIN;
        await lena.mutation(M.FieldConfirmation_complete, {
          docId: forms["field.arrival"],
          outcome: "all_good",
          observedAt: seenAt,
        } as never);
        expect((await answerOf("field.arrival")).fieldWork).toMatchObject({
          status: "done",
          confirmedBy: "Lena Crew",
          confirmedAt: new Date(seenAt).toISOString(),
        });
        // Every other day-of form is still waiting for its person.
        expect(
          (await answerOf("field.leaving-event")).fieldWork?.confirmedAt,
        ).toBe(null);
      },
      LONG,
    );

    it(
      "golden event 19: Execute/finalize/complete the Event; return/inspect rental and owned equipment and record damage/missing facts",
      async () => {
        const startsAt = WEEK.golden.startsAt + 7 * DAY;
        const endsAt = WEEK.golden.endsAt + 7 * DAY;
        const chafers = await w.run.logistics(M.Equipment_createViaRegister, {
          name: "Round chafer",
          assetTag: "CH-10",
          category: "holding",
          ownership: "owned",
          quantity: 10,
        });
        await w.proof.executeCommand(
          w.roles.logistics,
          api.equipmentCheckout.reserve,
          {
            equipmentId: chafers.docId,
            eventId: id.golden,
            startsAt,
            endsAt,
            quantity: 4,
          } as never,
        );
        const holds = await eventRows<{
          tenantId: string;
          _id: string;
          equipmentId: string;
          status: string;
        }>(w, "equipmentReservations", id.golden);
        const live = holds.filter((h) => h.status !== "cancelled");
        expect(live).toHaveLength(2);
        for (const hold of live)
          await w.run.logistics(M.EquipmentReservation_checkOut, {
            docId: hold._id,
            version: await versionOf(w, hold._id),
            condition: "good",
          });

        const step = (role: "sales" | "events", cmd: unknown) => async () =>
          w.run[role](cmd as never, {
            docId: id.golden,
            version: await versionOf(w, id.golden),
          });
        for (const [role, cmd] of [
          ["sales", M.Event_lockForSales],
          ["events", M.Event_beginExecution],
          ["events", M.Event_finalizeEvent],
          ["events", M.Event_complete],
        ] as const)
          await step(role, cmd)();
        expect(
          (await readRow<{ stage: string }>(w.owner, id.golden)).stage,
        ).toBe("completed");

        // Back at the warehouse: chargers come back 2 broken and 1 short; the
        // chafers come back fine.
        const staff = w.proof.asRole({
          subject: `logistics-staff-${TENANT}`,
          role: "logistics_staff",
          tenantId: TENANT,
        });
        const chargerHold = live.find((h) => h.equipmentId !== chafers.docId)!;
        const chaferHold = live.find((h) => h.equipmentId === chafers.docId)!;
        await w.proof.executeCommand(
          staff,
          M.EquipmentReservation_markReturned,
          {
            docId: chargerHold._id,
            version: await versionOf(w, chargerHold._id),
            condition: "fair",
            damagedQuantity: 2,
            missingQuantity: 1,
          } as never,
        );
        await w.proof.executeCommand(
          staff,
          M.EquipmentReservation_markReturned,
          {
            docId: chaferHold._id,
            version: await versionOf(w, chaferHold._id),
            condition: "good",
          } as never,
        );
        const issues = await eventRows<{
          tenantId: string;
          kind: string;
          quantity: number;
          equipmentReservationId?: string | null;
        }>(w, "equipmentIssues", id.golden);
        expect(
          issues
            .map((i) => [i.kind, i.quantity, i.equipmentReservationId])
            .sort(),
        ).toEqual([
          ["damaged", 2, chargerHold._id],
          ["missing", 1, chargerHold._id],
        ]);
        const exceptions = (await w.owner.query(
          api.equipmentCheckout.eventEquipmentExceptions,
          { eventId: id.golden } as never,
        )) as { problems: unknown[] };
        expect(exceptions.problems).toHaveLength(2);
      },
      LONG,
    );

    it(
      "golden event 20: Settle invoice/payment and generate the source-backed closeout projection with food, labor, rental, transport, waste, damage, and revenue actuals",
      async () => {
        const finance = w.proof.asRole({
          subject: `finance-${TENANT}`,
          role: "finance_manager",
          tenantId: TENANT,
        });
        const pay = (cmd: unknown, args: Record<string, unknown>) =>
          w.proof.executeCommand(finance, cmd as never, args as never);

        // Ana clocks out; her time is the labor record.
        await w.proof.executeCommand(
          w.proof.asRole({
            subject: `crew-ana-${TENANT}`,
            role: "event_staff",
            tenantId: TENANT,
          }),
          M.TimeRecord_clockOut,
          {
            docId: facts.clockInId,
            version: await versionOf(w, facts.clockInId),
            breakMinutes: 0,
          } as never,
        );

        // Damage: the company pays the broken chargers, the client the lost one.
        const issues = await eventRows<{
          tenantId: string;
          _id: string;
          kind: string;
        }>(w, "equipmentIssues", id.golden);
        const damaged = issues.find((i) => i.kind === "damaged")!;
        const missing = issues.find((i) => i.kind === "missing")!;
        await pay(M.EquipmentIssue_settle, {
          docId: damaged._id,
          version: await versionOf(w, damaged._id),
          resolution: "Two chargers paid to the rental company",
          payer: "company",
          cost: 30,
        });
        await pay(M.EquipmentIssue_settle, {
          docId: missing._id,
          version: await versionOf(w, missing._id),
          resolution: "Added to the final bill",
          payer: "client",
          chargeAmount: 15,
        });

        // The event's one invoice is sent and paid in full.
        const [invoice] = await eventRows<{
          tenantId: string;
          _id: string;
          status: string;
        }>(w, "invoices", id.golden);
        expect(invoice.status).toBe("draft");
        await pay(M.Invoice_send, {
          docId: invoice._id,
          version: await versionOf(w, invoice._id),
        });
        const sent = await readRow<{ total: number; amountDue: number }>(
          w.owner,
          invoice._id,
        );
        expect(sent.total).toBeGreaterThan(0);
        const payment = (await pay(M.Payment_createViaRecord, {
          invoiceId: invoice._id,
          clientId: id.client,
          amount: sent.amountDue,
          method: "card",
        })) as { docId: string };
        await pay(M.Payment_settle, {
          docId: payment.docId,
          version: await versionOf(w, payment.docId),
        });
        expect(
          await readRow<{ status: string; amountDue: number }>(
            w.owner,
            invoice._id,
          ),
        ).toMatchObject({ status: "paid", amountDue: 0 });
        facts.invoiceTotal = sent.total;

        // The closeout read: every line from Capsule's own records.
        const read = (await finance.query(
          api.closeoutSources.eventCloseoutSources,
          { eventId: id.golden } as never,
        )) as {
          projection: {
            lines: {
              key: string;
              actual: number | null;
              complete: boolean;
              sources: { table: string; id: string; amount: number }[];
            }[];
            collected: number;
            outstanding: number;
          };
        };
        const { lines } = read.projection;
        const line = (key: string) => lines.find((l) => l.key === key)!;
        const ids = (key: string) => line(key).sources.map((s) => s.id);
        // Revenue: the paid invoice, fully collected.
        expect(line("revenue").actual).toBe(sent.total);
        expect(ids("revenue")).toContain(invoice._id);
        expect(read.projection.collected).toBe(sent.total);
        expect(read.projection.outstanding).toBe(0);
        // Food: the flour that arrived on the shared weekly order counts for
        // this event; the order is only partly in, so the line stays open.
        const flourRow = await readRow<{
          receivedQuantity: number;
          unitCost: number;
        }>(w.owner, facts.flourLineId);
        expect(flourRow.receivedQuantity).toBeCloseTo(
          facts.orderedFlour / 2,
          4,
        );
        expect(
          line("ingredient").sources.find((s) => s.id === facts.flourLineId)
            ?.amount,
        ).toBeCloseTo(flourRow.receivedQuantity * flourRow.unitCost, 2);
        expect(line("ingredient").complete).toBe(false);
        // Waste: 0.5 kg at 2.
        expect(line("waste")).toMatchObject({ actual: 1, complete: true });
        expect(ids("waste")).toEqual([facts.wasteId]);
        // Labor: Ana's clocked time.
        expect(ids("labor")).toEqual([facts.clockInId]);
        // Rentals and damage: the company-paid damage is a cost.
        expect(line("vendor").sources).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: damaged._id, amount: 30 }),
          ]),
        );
        expect(line("vendor").complete).toBe(true);
      },
      LONG,
    );

    it(
      "golden event 21: Finalize closeout and prove reporting reads the frozen snapshot",
      async () => {
        const finance = w.proof.asRole({
          subject: `finance-${TENANT}`,
          role: "finance_manager",
          tenantId: TENANT,
        });
        await w.run.events(M.Event_closeOut, {
          docId: id.golden,
          version: await versionOf(w, id.golden),
        });
        // Lines the records cannot finish yet are typed once, by finance.
        await w.proof.executeCommand(
          finance,
          api.closeoutSources.captureCloseoutFromSources,
          {
            eventId: id.golden,
            entered: { ingredient: 25, labor: 180, headcount: 118 },
          } as never,
        );
        type Closeout = {
          _id: string;
          status: string;
          version: number;
          actualIngredientCost: number;
          actualWasteCost: number;
          actualRevenue: number;
          totalActualCost: number;
          sourceSnapshot: string;
        };
        const closeout = async () =>
          (
            await eventRows<Closeout & { tenantId: string }>(
              w,
              "eventCloseouts",
              id.golden,
            )
          )[0];
        const draft = await closeout();
        expect(draft).toMatchObject({
          status: "draft",
          actualIngredientCost: 25,
          actualWasteCost: 1,
          actualRevenue: facts.invoiceTotal,
        });
        await w.proof.executeCommand(finance, M.EventCloseout_finalize, {
          docId: draft._id,
          version: draft.version,
        } as never);
        const frozen = await closeout();
        expect(frozen.status).toBe("finalized");
        expect(frozen.sourceSnapshot).toContain(facts.wasteId);

        const report = async () =>
          (await w.owner.query(api.culinaryDemand.eventFoodCostReport, {
            eventId: id.golden,
          } as never)) as {
            estimated: { knownCost: number };
            actual: {
              ingredientCost: number;
              wasteCost: number;
              finalized: boolean;
            } | null;
            revenue: { amount: number; source: string } | null;
          };
        const before = await report();
        // Estimated versus actual food cost on the completed event (AC-338).
        expect(before.estimated.knownCost).toBeGreaterThan(0);
        expect(before.actual).toMatchObject({
          ingredientCost: 25,
          wasteCost: 1,
          finalized: true,
        });
        expect(before.revenue).toEqual({
          amount: facts.invoiceTotal,
          source: "closeout",
        });

        // Facts that arrive after finalizing do not move the frozen result:
        // the rest of the flour comes in and more waste is logged.
        const flour = await readRow<{
          orderedQuantity: number;
          receivedQuantity: number;
        }>(w.owner, facts.flourLineId);
        await w.proof.executeCommand(
          w.roles.procurement,
          M.VendorOrderLine_recordReceipt,
          {
            docId: facts.flourLineId,
            quantity: flour.orderedQuantity - flour.receivedQuantity,
            locationId: w.catalog.locationId,
            unitPrice: 2,
            supplierLotNumber: "GOLD-LOT-2",
          } as never,
        );
        const flourStock = (
          await liveRows<{
            tenantId: string;
            _id: string;
            ingredientId: string;
          }>(w.owner, "inventoryItems", TENANT)
        ).find((item) => item.ingredientId === w.catalog.ingredientIds[0])!;
        await w.proof.executeCommand(
          w.roles.inventory,
          M.WasteRecord_createViaRecord,
          {
            ingredientId: w.catalog.ingredientIds[0],
            locationId: w.catalog.locationId,
            inventoryItemId: flourStock._id,
            quantity: 2,
            unit: "kilogram",
            reason: "overproduction",
            unitCost: 2,
            eventId: id.golden,
          } as never,
        );
        expect(await closeout()).toEqual(frozen);
        // The estimate stays live (it prices at the newest receipt); the
        // actual and the revenue are the frozen closeout's.
        const after = await report();
        expect(after.actual).toEqual(before.actual);
        expect(after.revenue).toEqual(before.revenue);
        // The frozen result can only change through an audited correction.
        await expect(
          w.proof.executeCommand(
            finance,
            api.closeoutSources.captureCloseoutFromSources,
            {
              eventId: id.golden,
              entered: { ingredient: 30, labor: 180, headcount: 118 },
            } as never,
          ),
        ).rejects.toThrow(/final/);
      },
      LONG,
    );

    it(
      "golden event 22: Replay every external request and reaction; prove no duplicate business record or side effect",
      async () => {
        const counts = async () => {
          const out: Record<string, number> = {};
          for (const table of BUSINESS_TABLES)
            out[table] = (
              await liveRows<{ tenantId: string }>(w.owner, table, TENANT)
            ).length;
          for (const type of ["ProposalAccepted", "SignatureCompleted"])
            out[type] = (await emitted(w, type)).length;
          return out;
        };
        const before = await counts();
        const anaSelf = w.proof.asRole({
          subject: `crew-ana-${TENANT}`,
          role: "event_staff",
          tenantId: TENANT,
        });

        // The public form is sent again: same submission, nothing new.
        const again = await action<{
          submissionId: string;
          isDuplicate: boolean;
        }>(w.owner, api.quoteBuilder.submitQuote, {
          ...QUOTE,
          eventDate: WEEK.golden.startsAt,
          eventEndTime: WEEK.golden.endsAt,
        });
        expect(again.isDuplicate).toBe(true);
        // Converting it again is refused.
        await expect(
          action(w.owner, api.quoteBuilder.processQuoteSubmission, {
            submissionId: again.submissionId,
          }),
        ).rejects.toThrow(/Only pending submissions can be converted/);
        // The signing link is opened and clicked again.
        const [request] = await liveRows<{ tenantId: string; _id: string }>(
          w.owner,
          "signatureRequests",
          TENANT,
        );
        const click = (await w.raw.mutation(
          api.signatureAcceptance.completeSignature,
          { token: request._id } as never,
        )) as { ok: boolean };
        expect(click.ok).toBe(true);
        // The phone retries a clock-in and a pack count with the same key.
        const replayed = (await w.proof.executeCommand(
          anaSelf,
          M.TimeRecord_createViaClockIn,
          {
            personId: (
              await readRow<{ personId: string }>(w.owner, facts.clockInId)
            ).personId,
            idempotencyKey: "golden-ana-clock-in",
          } as never,
        )) as { docId: string };
        expect(replayed.docId).toBe(facts.clockInId);
        // Follow-up work runs again: food amounts, day-of forms, field
        // setup and the scheduled follow-ups find nothing to add.
        await w.owner.mutation(api.culinaryDemand.reconcileEventDemand, {
          eventId: id.golden,
        } as never);
        expect(
          await w.owner.mutation(
            (api.lib.eventPacket.finalLock as unknown as Record<string, never>)
              .prepareFieldForms,
            { eventId: id.golden } as never,
          ),
        ).toEqual({ prepared: 0 });
        vi.useFakeTimers();
        try {
          await settle(w.raw);
        } finally {
          vi.useRealTimers();
        }

        expect(await counts()).toEqual(before);
      },
      LONG,
    );
  },
);

/** Every business record the journey writes; a replay may add none. */
const BUSINESS_TABLES = [
  "clients",
  "clientContacts",
  "leads",
  "events",
  "proposals",
  "proposalRevisions",
  "signatureRequests",
  "eventDishes",
  "ingredientDemands",
  "eventIngredientContributions",
  "purchaseNeeds",
  "vendorOrders",
  "vendorOrderLines",
  "inventoryLots",
  "prepTasks",
  "packLists",
  "packListItems",
  "eventAssignments",
  "shifts",
  "timeRecords",
  "wasteRecords",
  "fieldConfirmations",
  "equipmentReservations",
  "equipmentIssues",
  "invoices",
  "payments",
  "eventCloseouts",
] as const;

async function routeFacts() {
  const rows = (await w.owner.run(async (ctx) =>
    ctx.db.query("manifestEvents").collect(),
  )) as unknown as {
    entity: string;
    entityId: string;
    payload: { fact?: unknown };
  }[];
  return rows.filter(
    (row) =>
      row.entity === "EventRoute" &&
      row.entityId === id.golden &&
      row.payload.fact,
  );
}
