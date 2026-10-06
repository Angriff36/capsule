/**
 * Runtime proof: the imported-record link reads in
 * convex/externalRecordLinkLists.ts return the same rows as before, now read
 * through their own indexes (record type, Capsule record kind, waiting
 * status) instead of every link of the company, which timed out
 * /admin/reconcile on 2026-10-06. Filters combine with "or", a removed link
 * never shows, another workspace sees nothing, and field staff (no
 * importAccess) read nothing. Synthetic workspaces and records only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: imported-record link reads use their indexes", () => {
  it("returns only the asked-for links of the workspace", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const tenantId = "tenant-link-lists";
    const owner = proof.asRole({
      subject: "ll-owner",
      role: "owner",
      tenantId,
    });
    const staff = proof.asRole({
      subject: "ll-staff",
      role: "event_staff",
      tenantId,
    });
    const outsider = proof.asRole({
      subject: "ll-outsider",
      role: "owner",
      tenantId: "tenant-link-lists-other",
    });

    await owner.run(async (ctx) => {
      const db = (
        ctx as unknown as {
          db: { insert: (table: string, value: object) => Promise<string> };
        }
      ).db;
      const base = {
        tenantId,
        sourceSystem: "tpp_legacy",
        verified: false,
        version: 1,
      };
      const add = (
        externalId: string,
        recordType: string,
        capsuleEntity: string,
        conflictStatus: string,
        extra: object = {},
      ) =>
        db.insert("externalRecordLinks", {
          ...base,
          externalId,
          recordType,
          capsuleEntity,
          conflictStatus,
          capsuleId: `capsule-${externalId}`,
          ...extra,
        });
      await add("pay-1", "payment", "payment", "resolved");
      await add("pay-removed", "payment", "payment", "resolved", {
        deletedAt: Date.now(),
      });
      await add("event-waiting", "event", "event_record", "pending_conflict");
      await add("event-done", "event", "event_record", "resolved");
      await add("menu-1", "menu", "dish", "resolved");
      await add("menu-waiting", "menu", "dish", "pending_conflict");
      await db.insert("externalRecordLinks", {
        ...base,
        tenantId: "tenant-link-lists-other",
        externalId: "other-pay",
        recordType: "payment",
        capsuleEntity: "payment",
        conflictStatus: "pending_conflict",
        capsuleId: "capsule-other-pay",
      });
    });

    const ids = async (
      actor: typeof owner,
      filter: {
        recordTypes?: string[];
        pending?: boolean;
        capsuleEntities?: string[];
      },
    ) =>
      (
        (await actor.query(api.externalRecordLinkLists.listFor, filter)) as {
          externalId: string;
        }[]
      )
        .map((row) => row.externalId)
        .sort();

    // The match-up page: payments OR anything still waiting.
    expect(
      await ids(owner, { pending: true, recordTypes: ["payment"] }),
    ).toEqual(["event-waiting", "menu-waiting", "pay-1"]);
    // Finance reconciliation: payments only.
    expect(await ids(owner, { recordTypes: ["payment"] })).toEqual(["pay-1"]);
    // Parallel run: every link to an event.
    expect(await ids(owner, { capsuleEntities: ["event_record"] })).toEqual([
      "event-done",
      "event-waiting",
    ]);
    // A link that matches two filters shows once.
    expect(await ids(owner, { recordTypes: ["event"], pending: true })).toEqual(
      ["event-done", "event-waiting", "menu-waiting"],
    );
    // No filter asks for nothing.
    expect(await ids(owner, {})).toEqual([]);

    // Menu counts read the menu links only.
    expect(
      await owner.query(api.externalRecordLinkLists.menuLinkStats, {}),
    ).toMatchObject({ tppTotal: 2, unresolvedLinks: 2 });

    // Field staff and another workspace read nothing of this workspace.
    expect(
      await ids(staff, { recordTypes: ["payment"], pending: true }),
    ).toEqual([]);
    expect(await ids(outsider, { recordTypes: ["payment"] })).toEqual([
      "other-pay",
    ]);
  });
});
