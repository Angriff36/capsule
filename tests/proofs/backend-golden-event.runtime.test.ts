/**
 * Runtime proof: the golden event (PL-NATIVE-JOURNEY, backend end-state spec
 * §20.1, AC-653..AC-674). ONE tenant, ONE golden Event and one competing
 * Event in the same purchasing week, walked step by step with the same
 * identities. Each `it` is one numbered golden-event step and builds on the
 * steps before it (vitest runs them in file order over the shared world).
 * Provider boundaries are stubbed; every write goes through the governed
 * commands and seams the product screens use.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  action,
  emitted,
  eventRows,
  FACTS,
  liveRows,
  QUOTE,
  readRow,
  seedOperatorPerson,
  seedWorld,
  TENANT,
  versionOf,
  WEEK,
  type World,
} from "./backend-golden-event.runtime.helpers";
import { readReconciliationReceipts } from "./single-reconciliation.runtime.helpers";
import {
  drafts,
  lineFor,
  linkedEventIds,
} from "./weekly-purchasing.runtime.helpers";

const M = api.mutations;
const LONG = 120_000;

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

let w: World;
const id = {
  client: "",
  golden: "",
  rival: "",
  inquiryProposal: "",
  proposal: "",
  revision: "",
  breadLine: "",
  saltLine: "",
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
    "golden event 06: Verify exactly one active Event menu set, ingredient contribution per source, demand line per compatible event/ingredient/unit, invoice draft, pack list, and intended staffing/prep records",
    async () => {
      // One menu set: the two lines added before acceptance, no copies.
      const dishes = await eventRows<{
        tenantId: string;
        dishId: string;
      }>(w, "eventDishes", id.golden);
      expect(dishes.map((d) => d.dishId).sort()).toEqual(
        [...w.catalog.dishIds].sort(),
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
      expect(domains).toEqual(expect.arrayContaining(["demand", "menu"]));
      for (const receipt of receipts)
        expect(receipt.checkpoint.state).toBe("complete");

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
});
