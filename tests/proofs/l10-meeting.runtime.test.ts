/**
 * Runtime proof (PL-DASHBOARDS): the parts of the owner's weekly L10 meeting
 * sheet the L10 page keeps (src/insights/leadership.manifest). A priority
 * (rock) gets this week's on track / at risk / off track mark; an issue is
 * closed by writing the answer the team agreed on; client and people
 * headlines are kept as items; a meeting is rated 1 to 10 with what went
 * well, what to improve and the decisions, and can be corrected.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-l10-meeting";
const OTHER = "tenant-l10-meeting-other";
const HELD = Date.UTC(2026, 9, 5, 15);

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: the weekly L10 meeting", () => {
  it("marks rocks, solves issues, keeps headlines and rates the meeting", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "l10-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const outsider = proof.asRole({
      subject: "l10-outsider",
      role: "owner",
      tenantId: OTHER,
    });
    const add = async (kind: string, title: string, notes?: string) =>
      (
        (await owner.mutation(api.mutations.LeadershipItem_createViaAdd, {
          kind,
          title,
          notes,
        } as never)) as { docId: Id<"leadershipItems"> }
      ).docId;
    const get = (id: Id<"leadershipItems">) =>
      owner.run((ctx) => ctx.db.get(id));

    const rock = await add("rock", "Open the second kitchen");
    const issue = await add("issue", "Rentals arrive late", "Same vendor 3x");
    const clientNews = await add("client_headline", "Bride sent a thank-you");
    const peopleNews = await add("people_headline", "New sous chef starts");
    expect((await get(clientNews))?.kind).toBe("client_headline");
    expect((await get(peopleNews))?.kind).toBe("people_headline");

    // Rock: this week's mark. Only a rock takes one.
    await owner.mutation(api.mutations.LeadershipItem_markTrack, {
      docId: rock,
      version: (await get(rock))!.version,
      track: "at_risk",
    } as never);
    const marked = await get(rock);
    expect(marked?.track).toBe("at_risk");
    expect(marked?.trackSetAt).toEqual(expect.any(Number));
    expect(marked?.status).toBe("open");
    await expect(
      owner.mutation(api.mutations.LeadershipItem_markTrack, {
        docId: issue,
        version: (await get(issue))!.version,
        track: "on_track",
      } as never),
    ).rejects.toThrow();

    // Issue: solving needs the agreed answer and closes it.
    await expect(
      owner.mutation(api.mutations.LeadershipItem_solve, {
        docId: issue,
        version: (await get(issue))!.version,
        solution: "  ",
      } as never),
    ).rejects.toThrow(/agreed on/);
    await owner.mutation(api.mutations.LeadershipItem_solve, {
      docId: issue,
      version: (await get(issue))!.version,
      solution: "Switch to the second rental company",
    } as never);
    const solved = await get(issue);
    expect(solved).toMatchObject({
      status: "done",
      solution: "Switch to the second rental company",
      notes: "Same vendor 3x",
    });
    expect(solved?.closedAt).toEqual(expect.any(Number));

    // Meeting rating: 1 to 10 only, and can be corrected.
    await expect(
      owner.mutation(api.mutations.LeadershipMeeting_createViaRecord, {
        heldAt: HELD,
        rating: 11,
      } as never),
    ).rejects.toThrow(/1 to 10/);
    const meetingId = (
      (await owner.mutation(api.mutations.LeadershipMeeting_createViaRecord, {
        heldAt: HELD,
        rating: 7,
        wentWell: "Started on time",
        toImprove: "Too long on rentals",
        decisions: "Second rental company",
      } as never)) as { docId: Id<"leadershipMeetings"> }
    ).docId;
    const meeting = await owner.run((ctx) => ctx.db.get(meetingId));
    expect(meeting).toMatchObject({
      heldAt: HELD,
      rating: 7,
      wentWell: "Started on time",
      toImprove: "Too long on rentals",
      decisions: "Second rental company",
    });
    expect(meeting?.recordedAt).toEqual(expect.any(Number));
    await owner.mutation(api.mutations.LeadershipMeeting_revise, {
      docId: meetingId,
      version: meeting!.version,
      heldAt: HELD,
      rating: 8,
      wentWell: "Started on time",
    } as never);
    const revised = await owner.run((ctx) => ctx.db.get(meetingId));
    expect(revised?.rating).toBe(8);

    // Another company sees none of it.
    const theirs = (await outsider.query(
      api.queries.listLeadershipMeeting,
      {},
    )) as unknown[];
    expect(theirs).toHaveLength(0);
    const ours = (await owner.query(
      api.queries.listLeadershipMeeting,
      {},
    )) as unknown[];
    expect(ours).toHaveLength(1);
  });
});
