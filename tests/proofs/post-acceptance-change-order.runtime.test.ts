/**
 * PL-COMMERCIAL-CHANGE runtime proof (AC-378, AC-420): after the client
 * accepts, the event grows (40 → 65 guests). The accepted proposal is never
 * edited: a change opens a new draft linked to the accepted proposal and the
 * event, starting at the event's new guest count; sending it freezes a new
 * revision that names the accepted proposal, the exact revision the client
 * accepted, and the event. The accepted revision stays byte-identical and the
 * original stays accepted against it, also after the change is accepted.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  generate,
  S,
  seedWorld,
  type World,
} from "./proposal-generate.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Revision = { _id: string; revisionNumber: number; snapshot: string };

const row = async (w: World, id: string) =>
  (await w.owner.run((ctx) => ctx.db.get(id as never))) as any;

const revisionsOf = async (w: World, proposalId: string) =>
  (await w.sales.query(api.queries.listProposalRevisionByProposalId, {
    proposalId,
  } as never)) as unknown as Revision[];

describe("change after acceptance (AC-378 / AC-420)", () => {
  it("makes a linked change document and never edits the accepted revision", async () => {
    const w = await seedWorld("tenant-post-acceptance-change");
    const { proposalId: acceptedId } = await generate(w);
    await w.proof.executeCommand(
      w.sales,
      api.lib.proposalRevision.sendProposalWithRevisionCapture as never,
      { docId: acceptedId } as never,
    );
    const [accepted] = await revisionsOf(w, acceptedId);
    await w.proof.executeCommand(w.sales, api.mutations.Proposal_accept, {
      docId: acceptedId,
      acceptedRevisionId: accepted._id,
    } as never);
    const acceptedBefore = await row(w, acceptedId);
    expect(acceptedBefore).toMatchObject({
      status: "accepted",
      guestCount: S.headcount,
      acceptedRevisionId: accepted._id,
      eventId: w.eventId,
    });

    // The event grows after acceptance.
    await w.runOwner(api.mutations.Event_changeHeadcount, {
      docId: w.eventId,
      newHeadcount: S.headcount + 25,
    });
    expect(await row(w, acceptedId)).toMatchObject({
      status: "accepted",
      guestCount: S.headcount,
      total: acceptedBefore.total,
      version: acceptedBefore.version,
    });

    // The change is a new draft linked to the accepted proposal and the event,
    // starting at the event's new guest count.
    const change = (await w.proof.executeCommand(
      w.sales,
      api.lib.proposalChangeDraft.startProposalChange as never,
      { proposalId: acceptedId } as never,
    )) as { docId: string; alreadyStarted: boolean };
    expect(change.alreadyStarted).toBe(false);
    expect(await row(w, change.docId)).toMatchObject({
      status: "draft",
      replacesProposalId: acceptedId,
      eventId: w.eventId,
      guestCount: S.headcount + 25,
    });

    // Sending the change freezes Revision 2, which names what it changes.
    await w.proof.executeCommand(
      w.sales,
      api.lib.proposalRevision.sendProposalWithRevisionCapture as never,
      { docId: change.docId } as never,
    );
    const [changeRevision] = await revisionsOf(w, change.docId);
    expect(changeRevision.revisionNumber).toBe(2);
    const frozen = JSON.parse(changeRevision.snapshot);
    expect(frozen.changeOf).toEqual({
      proposalId: acceptedId,
      acceptedRevisionId: accepted._id,
      eventId: w.eventId,
    });
    expect(frozen.proposal.guestCount).toBe(S.headcount + 25);

    // The accepted document is untouched: same status, same revision, same bytes.
    const check = async () => {
      expect(await row(w, acceptedId)).toMatchObject({
        status: "accepted",
        acceptedRevisionId: accepted._id,
        guestCount: S.headcount,
        total: acceptedBefore.total,
        version: acceptedBefore.version,
      });
      const again = await revisionsOf(w, acceptedId);
      expect(again).toHaveLength(1);
      expect(again[0].snapshot).toBe(accepted.snapshot);
      expect(JSON.parse(again[0].snapshot).changeOf).toBeNull();
    };
    await check();

    // Accepting the change keeps both: the original stays accepted history.
    await w.proof.executeCommand(w.sales, api.mutations.Proposal_accept, {
      docId: change.docId,
      acceptedRevisionId: changeRevision._id,
    } as never);
    expect(await row(w, change.docId)).toMatchObject({
      status: "accepted",
      acceptedRevisionId: changeRevision._id,
      replacesProposalId: acceptedId,
    });
    await check();
  });
});
