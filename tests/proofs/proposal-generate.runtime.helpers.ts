/**
 * Shared seed for the PL-PROPOSAL-DRAFT proofs: a workspace with a published,
 * priced menu, a planned event with two menu dishes, and a sales manager who
 * builds the proposal through convex/lib/proposalGenerate.generateProposalDraft.
 */
import { api } from "../../convex/_generated/api";
import {
  harness,
  runner,
  S,
  type Proof,
  type Role,
} from "./headcount-proposal-reconciliation.runtime.helpers";

export { S };
const M = api.mutations;

export type ProposalRecord = {
  _id: string;
  status: string;
  title: string;
  eventId: string | null;
  eventDate: number | null;
  eventType: string | null;
  venueName: string | null;
  guestCount: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  version: number;
  generationJson: string | null;
};

export type LineRecord = {
  _id: string;
  description: string;
  pricingBasis: string;
  unitPrice: number;
  quantity: number;
  amount: number;
  menuDishId: string | null;
  overrideReason: string | null;
  deletedAt: number | null;
  version: number;
};

export type World = {
  proof: Proof;
  tenantId: string;
  owner: Role;
  sales: Role;
  runOwner: ReturnType<typeof runner>;
  runSales: ReturnType<typeof runner>;
  clientId: string;
  eventId: string;
  menuId: string;
  dishes: { salmon: string; brisket: string; tart: string };
  eventDishes: { salmon: string; brisket: string };
};

export async function seedWorld(
  tenantId: string,
  opts: { imported?: boolean; organization?: boolean } = {},
): Promise<World> {
  const proof = harness();
  const owner = proof.asRole({
    subject: `owner-${tenantId}`,
    role: "owner",
    tenantId,
  });
  const sales = proof.asRole({
    subject: `sales-${tenantId}`,
    role: "sales_manager",
    tenantId,
  });
  const runOwner = runner(proof, owner);
  const runSales = runner(proof, sales);
  if (opts.organization !== false) {
    await runOwner(M.Organization_createViaRegister, {
      name: "Proof Kitchen LLC",
      brandDisplayName: "Proof Kitchen Catering",
    });
  }
  const client = await runSales(M.Client_createViaRegister, {
    clientType: "company",
    companyName: `Generate client ${tenantId}`,
  });
  const menu = await runOwner(M.Menu_createViaDraft, { name: "Fall menu" });
  const dish = async (name: string) =>
    (
      await runOwner(M.Dish_createViaIntroduce, {
        name,
        portionSize: 1,
        portionUnit: "serving",
      })
    ).docId;
  const dishes = {
    salmon: await dish("Cedar salmon"),
    brisket: await dish("Smoked brisket"),
    tart: await dish("Apple tart"),
  };
  await runOwner(M.MenuDish_createViaAdd, {
    menuId: menu.docId,
    dishId: dishes.salmon,
    sellingPrice: 24,
  });
  await runOwner(M.MenuDish_createViaAdd, {
    menuId: menu.docId,
    dishId: dishes.brisket,
    sellingPrice: 18.5,
  });
  await runOwner(M.MenuDish_createViaAdd, {
    menuId: menu.docId,
    dishId: dishes.tart,
    sellingPrice: 7,
  });
  await runOwner(M.Menu_markPublished, { docId: menu.docId });

  const eventFacts = {
    clientId: client.docId,
    title: "Harvest dinner",
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: S.headcount,
    primaryContactName: "Casey Closesheet",
  };
  const event = opts.imported
    ? await runOwner(M.Event_createViaCaptureDraft, {
        ...eventFacts,
        venueName: "Old Mill Barn",
        importSourceKey: "tpp:6014",
      })
    : await runOwner(M.Event_createViaPlanEngagement, {
        ...eventFacts,
        budgetAmount: 3000,
        quotedPrice: 4500,
      });
  const addDish = async (dishId: string, quantityServings: number) =>
    (
      await runOwner(M.EventDish_createViaAddToEvent, {
        eventId: event.docId,
        dishId,
        quantityServings,
      })
    ).docId;
  const eventDishes = {
    salmon: await addDish(dishes.salmon, 40),
    brisket: await addDish(dishes.brisket, 30),
  };
  return {
    proof,
    tenantId,
    owner,
    sales,
    runOwner,
    runSales,
    clientId: client.docId,
    eventId: event.docId,
    menuId: menu.docId,
    dishes,
    eventDishes,
  };
}

export function generate(w: World) {
  return w.sales.mutation(
    (api.lib as any).proposalGenerate.generateProposalDraft,
    {
      eventId: w.eventId,
    },
  ) as Promise<{ proposalId: string; created: boolean; changed: boolean }>;
}

export function report(w: World, proposalId: string) {
  return w.sales.query(
    (api.lib as any).proposalDraftReport.getProposalDraftReport,
    {
      proposalId,
    },
  ) as Promise<{
    generated: boolean;
    eventId: string | null;
    legacy: {
      eventNumber: string | null;
      importSourceKey: string | null;
    } | null;
    sections: {
      key: string;
      sources: { table: string; id: string }[];
      stale: boolean;
      staleReasons: string[];
    }[];
    issues: { code: string; message: string; recordIds: string[] }[];
  }>;
}

export async function proposalRow(
  w: World,
  proposalId: string,
): Promise<ProposalRecord> {
  return (await w.sales.query(api.queries.getProposal, {
    id: proposalId as never,
  })) as unknown as ProposalRecord;
}

export async function liveLines(
  w: World,
  proposalId: string,
): Promise<LineRecord[]> {
  const rows = (await w.sales.query(
    api.queries.listProposalLineItemByProposalId,
    {
      proposalId,
    } as never,
  )) as unknown as LineRecord[];
  return rows
    .filter((row) => row.deletedAt == null)
    .sort((a, b) => a.description.localeCompare(b.description));
}

export async function eventProposals(w: World): Promise<ProposalRecord[]> {
  const rows = (await w.sales.query(api.queries.listProposalByEventId, {
    eventId: w.eventId,
  } as never)) as unknown as (ProposalRecord & { deletedAt: number | null })[];
  return rows.filter((row) => row.deletedAt == null);
}
