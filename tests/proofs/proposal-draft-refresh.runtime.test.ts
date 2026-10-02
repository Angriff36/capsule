/**
 * PL-PROPOSAL-DRAFT runtime proof (AC-416, AC-431, AC-261): ONE command builds
 * a proposal draft from an event or refreshes the unsent draft it built
 * before. Replay reuses the draft and writes nothing; a refresh brings the
 * draft up to the event's current date, guest count and menu; an imported
 * event goes through the same command and keeps its import key readable.
 * Prices come only from the published menu.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  eventProposals,
  generate,
  liveLines,
  proposalRow,
  report,
  S,
  seedWorld,
} from "./proposal-generate.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("generate proposal draft from an event (AC-416 / AC-431)", () => {
  it("replay reuses the unpublished draft; refresh updates it from current facts", async () => {
    const w = await seedWorld("tenant-generate-refresh");

    const first = await generate(w);
    expect(first.created).toBe(true);
    const draft = await proposalRow(w, first.proposalId);
    expect(draft).toMatchObject({
      status: "draft",
      title: "Harvest dinner",
      eventId: w.eventId,
      eventDate: S.startsAt,
      eventType: "corporate dinner",
      guestCount: S.headcount,
    });
    const lines = await liveLines(w, first.proposalId);
    expect(
      lines.map((l) => [
        l.description,
        l.pricingBasis,
        l.unitPrice,
        l.quantity,
        l.amount,
      ]),
    ).toEqual([
      ["Cedar salmon", "per_unit", 24, 40, 960],
      ["Smoked brisket", "per_unit", 18.5, 30, 555],
    ]);
    expect(lines.every((l) => l.menuDishId != null)).toBe(true);
    expect(draft.subtotal).toBe(1515);
    expect(draft.total).toBe(1515);

    // Replay: same draft, nothing written.
    const replay = await generate(w);
    expect(replay).toEqual({
      proposalId: first.proposalId,
      created: false,
      changed: false,
      outcome: "reused",
      version: expect.any(Number),
    });
    expect((await proposalRow(w, first.proposalId)).version).toBe(
      draft.version,
    );
    expect(await eventProposals(w)).toHaveLength(1);

    // The event moves: new date, more guests, more salmon, a dessert added.
    const newStart = Date.UTC(2026, 10, 2, 17, 0);
    await w.runOwner(M.Event_reschedule, {
      docId: w.eventId,
      startsAt: newStart,
      endsAt: newStart + 5 * 3600_000,
    });
    await w.runOwner(M.Event_changeHeadcount, {
      docId: w.eventId,
      newHeadcount: 55,
    });
    await w.runOwner(M.EventDish_adjustServings, {
      docId: w.eventDishes.salmon,
      quantityServings: 55,
    });
    await w.runOwner(M.EventDish_createViaAddToEvent, {
      eventId: w.eventId,
      dishId: w.dishes.tart,
      quantityServings: 55,
    });

    const before = await report(w, first.proposalId);
    expect(before.sections.find((s) => s.key === "menu")?.stale).toBe(true);
    expect(before.sections.find((s) => s.key === "event")?.stale).toBe(true);

    const refresh = await generate(w);
    expect(refresh).toMatchObject({
      proposalId: first.proposalId,
      created: false,
      changed: true,
    });
    const refreshed = await proposalRow(w, first.proposalId);
    expect(refreshed.eventDate).toBe(newStart);
    expect(refreshed.guestCount).toBe(55);
    const after = await liveLines(w, first.proposalId);
    expect(after.map((l) => [l.description, l.quantity, l.amount])).toEqual([
      ["Apple tart", 55, 385],
      ["Cedar salmon", 55, 1320],
      ["Smoked brisket", 30, 555],
    ]);
    expect(refreshed.subtotal).toBe(2260);
    expect(refreshed.total).toBe(2260);
    const clean = await report(w, first.proposalId);
    expect(clean.sections.every((s) => !s.stale)).toBe(true);
    expect(await eventProposals(w)).toHaveLength(1);

    // A second replay after the refresh is a no-op again.
    expect(await generate(w)).toEqual({
      proposalId: first.proposalId,
      created: false,
      changed: false,
      outcome: "reused",
      version: expect.any(Number),
    });
  });

  it("a sent proposal is never rewritten; the next build starts a new draft", async () => {
    const w = await seedWorld("tenant-generate-sent");
    const first = await generate(w);
    await w.sales.mutation(
      (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
      {
        docId: first.proposalId,
      },
    );
    await w.runOwner(M.EventDish_adjustServings, {
      docId: w.eventDishes.salmon,
      quantityServings: 45,
    });
    const next = await generate(w);
    expect(next.created).toBe(true);
    expect(next.proposalId).not.toBe(first.proposalId);
    const sentLines = await liveLines(w, first.proposalId);
    expect(
      sentLines.find((l) => l.description === "Cedar salmon")?.quantity,
    ).toBe(40);
    expect((await proposalRow(w, first.proposalId)).status).toBe("sent");
  });
});

describe("imported event uses the same command (AC-261)", () => {
  it("builds the draft from an imported event and keeps its import key readable", async () => {
    const w = await seedWorld("tenant-generate-imported", { imported: true });
    const built = await generate(w);
    expect(built.created).toBe(true);
    const draft = await proposalRow(w, built.proposalId);
    expect(draft.venueName).toBe("Old Mill Barn");
    expect(
      (await liveLines(w, built.proposalId)).map((l) => l.description),
    ).toEqual(["Cedar salmon", "Smoked brisket"]);
    const r = await report(w, built.proposalId);
    expect(r.generated).toBe(true);
    expect(r.legacy?.importSourceKey).toBe("tpp:6014");
    // The typed venue is not a saved venue yet - surfaced before sending (AC-262).
    expect(r.issues.map((i) => i.code)).toContain("venue_not_linked");
    // The same send path as a native proposal.
    await w.sales.mutation(
      (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
      {
        docId: built.proposalId,
      },
    );
    expect((await proposalRow(w, built.proposalId)).status).toBe("sent");
  });
});
