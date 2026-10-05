/**
 * Nowsta replacement (BE-20.6, staffing job "announcements"): a manager posts
 * a team announcement, every staff member of the company sees it, each
 * person's close is kept once (the manager's "read and closed by" count),
 * another company sees nothing, and staff cannot post or take one down.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const TENANT = "tenant-announcement-board";

describe("runtime proof: team announcements", () => {
  it("posts, shows to staff, counts each close once, stays inside the company", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const manager = proof.asRole({
      subject: "board-manager",
      role: "manager",
      tenantId: TENANT,
    });
    const cook = proof.asRole({
      subject: "board-cook",
      role: "kitchen_staff",
      tenantId: TENANT,
    });
    const server = proof.asRole({
      subject: "board-server",
      role: "staff",
      tenantId: TENANT,
    });
    const outsider = proof.asRole({
      subject: "board-outsider",
      role: "manager",
      tenantId: "tenant-announcement-other",
    });

    const posted = (await proof.executeCommand(
      manager,
      api.mutations.Announcement_createViaPost,
      {
        title: "New allergy procedure",
        body: "Read the cross-contact sheet before Friday.",
        category: "safety",
        expiresAt: Date.now() + 7 * 86_400_000,
      },
    )) as { docId: string };

    // Staff cannot post.
    await expect(
      proof.executeCommand(cook, api.mutations.Announcement_createViaPost, {
        title: "Not allowed",
        body: "Staff post",
        category: "general",
        expiresAt: Date.now() + 86_400_000,
      }),
    ).rejects.toThrow();

    // Every staff member of the company sees it; another company does not.
    for (const actor of [cook, server]) {
      const rows = (await actor.query(
        api.queries.listAnnouncement,
        {},
      )) as any[];
      expect(rows.map((row) => row._id)).toEqual([posted.docId]);
    }
    expect(
      (await outsider.query(api.queries.listAnnouncement, {})) as any[],
    ).toEqual([]);

    // Each person counts once in "read and closed by", even after a second
    // close.
    await proof.executeCommand(
      cook,
      api.mutations.AnnouncementDismissal_createViaDismiss,
      { announcementId: posted.docId },
    );
    await proof
      .executeCommand(
        cook,
        api.mutations.AnnouncementDismissal_createViaDismiss,
        { announcementId: posted.docId },
      )
      .catch(() => undefined);
    await proof.executeCommand(
      server,
      api.mutations.AnnouncementDismissal_createViaDismiss,
      { announcementId: posted.docId },
    );
    const closes = (await manager.query(
      api.queries.listAnnouncementDismissal,
      {},
    )) as any[];
    const people = new Set(
      closes
        .filter((row) => row.announcementId === posted.docId)
        .map((row) => row.authSubjectId),
    );
    expect(people.size).toBe(2);
    expect(
      (await outsider.query(
        api.queries.listAnnouncementDismissal,
        {},
      )) as any[],
    ).toEqual([]);

    // Staff cannot take it down; the manager can, for everyone.
    const row = (
      (await manager.query(api.queries.listAnnouncement, {})) as any[]
    )[0];
    await expect(
      proof.executeCommand(cook, api.mutations.Announcement_remove, {
        docId: row._id,
        version: row.version,
      }),
    ).rejects.toThrow();
    await proof.executeCommand(manager, api.mutations.Announcement_remove, {
      docId: row._id,
      version: row.version,
    });
    const after = (await cook.query(api.queries.listAnnouncement, {})) as any[];
    expect(after.filter((item) => item.deletedAt == null)).toEqual([]);
  });
});
