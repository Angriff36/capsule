// @vitest-environment edge-runtime
/**
 * AC-473 (BE-10.3): automatic recalculation never sends an order and never
 * contacts a vendor. A draft stays a draft, and a sent order is not written
 * at all - not its status, not its lines, not its money.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../../convex/_generated/api";
import {
  approvedEvent,
  drafts,
  harness,
  linesOf,
  liveRows,
  readRow,
  rolesFor,
  runner,
  seedCatalog,
  versionOf,
  type OrderRow,
} from "../../proofs/weekly-purchasing.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("weekly recalculation never sends an order (AC-473)", () => {
  it("recalculation on a submitted order performs no writes to the order", async () => {
    const proof = harness();
    const tenantId = "tenant-ac473-never-submits";
    const roles = rolesFor(proof, tenantId);
    const buyer = runner(proof, roles.procurement);
    const events = runner(proof, roles.events);
    const catalog = await seedCatalog(proof, tenantId, [
      { name: "Lentils", perServing: 0.1 },
      { name: "Cumin", perServing: 0.01 },
    ]);
    const eventId = await approvedEvent(proof, tenantId, {
      title: "AC-473 supper",
      headcount: 40,
      dishIds: catalog.dishIds,
    });
    const messagesBefore = await liveRows(roles.events, "messages", tenantId);

    // A recalculation on a draft keeps it a draft.
    await events(M.Event_changeHeadcount, {
      docId: eventId,
      version: await versionOf(roles.events, eventId),
      newHeadcount: 50,
    });
    const [draft] = await drafts(roles.procurement, tenantId);
    expect(draft!.status).toBe("draft");
    expect(draft!.submittedAt ?? null).toBeNull();

    await buyer(M.VendorOrder_submit, {
      docId: draft!._id,
      version: draft!.version,
    });
    const sent = await readRow<OrderRow>(roles.procurement, draft!._id);
    const sentLines = await linesOf(roles.procurement, tenantId, draft!._id);

    // Fewer guests, then more guests: both recalculate purchasing.
    for (const newHeadcount of [30, 45]) {
      await events(M.Event_changeHeadcount, {
        docId: eventId,
        version: await versionOf(roles.events, eventId),
        newHeadcount,
      });
    }

    expect(await readRow<OrderRow>(roles.procurement, draft!._id)).toEqual(
      sent,
    );
    expect(await linesOf(roles.procurement, tenantId, draft!._id)).toEqual(
      sentLines,
    );
    // Any extra need waits on a draft for the buyer; nothing was sent.
    const open = await drafts(roles.procurement, tenantId);
    for (const order of open) {
      expect(order.status).toBe("draft");
      expect(order.submittedAt ?? null).toBeNull();
    }
    // No message went out to anyone.
    expect(await liveRows(roles.events, "messages", tenantId)).toEqual(
      messagesBefore,
    );
  });
});
