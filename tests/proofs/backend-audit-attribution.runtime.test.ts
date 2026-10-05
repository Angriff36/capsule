/**
 * PL-AUDIT — AC-635 / AC-193 / AC-209 / AC-154 / AC-636 (P leg).
 *
 * Every step is attributable: one history row per step transaction names the
 * company, the sign-in, the staff profile and role, the step, the record, the
 * time, the retry key and the record's version after. The row keeps ids and
 * names only, so a secret sent to a step (an API key, a device key) never
 * reaches it. A history write that fails never undoes the step and shows up
 * in the manager check as an event with no history row. Managers of one
 * company never see another company's history. Synthetic workspaces.
 */
import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { recordCommandAudit } from "../../convex/lib/commandAudit";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const TENANT = "tenant-audit-proof";
const OTHER = "tenant-audit-other";
const SECRET = "sk-live-proof-0123456789abcdefSECRET";
const CREDENTIAL = /sk-live|SECRET|p256dh-proof|auth-proof-key/;

async function seedPerson(
  t: TestConvex,
  tenantId: string,
  subject: string,
  role: string,
) {
  const personId = await t.run(
    async (ctx) =>
      (await ctx.db.insert("people", {
        tenantId,
        givenName: "Mona",
        familyName: subject,
        email: `${subject}@proof.test`,
        role,
        employmentType: "full_time",
        status: "active",
        deletedAt: null,
        version: 1,
        authSubjectId: subject,
      } as never)) as Id<"people">,
  );
  return {
    personId,
    as: t.withIdentity({
      subject,
      tokenIdentifier: `proof|${subject}`,
      tenantId,
    }),
  };
}

const auditsOf = (t: TestConvex, tenantId: string) =>
  t.run(async (ctx) =>
    ctx.db
      .query("commandAuditRecords")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect(),
  );

describe("PL-AUDIT step history", () => {
  it("names company, person, step, record, time, retry key and version, once per step", async () => {
    const t = setup();
    const { as: mona, personId } = await seedPerson(
      t,
      TENANT,
      "mona",
      "manager",
    );

    const created = (await mona.mutation(
      api.mutations.Station_createViaDefine,
      {
        name: "Grill",
        idempotencyKey: "station-grill-1",
      },
    )) as { docId: string };
    // The same retry is answered from its receipt: no second step, no second row.
    await mona.mutation(api.mutations.Station_createViaDefine, {
      name: "Grill",
      idempotencyKey: "station-grill-1",
    });
    // A step that used to leave no event row now leaves one, and a history row.
    await mona.mutation(api.mutations.Station_retire, {
      docId: created.docId as Id<"stations">,
      reason: "Closed for the season",
    });

    const audits = (await auditsOf(t, TENANT)).sort(
      (a, b) => a._creationTime - b._creationTime,
    );
    expect(audits).toHaveLength(2);
    const [made, retired] = audits;
    expect(made).toMatchObject({
      tenantId: TENANT,
      subjectEntity: "Station",
      subjectId: created.docId,
      actorUserId: "mona",
      actorPersonId: personId,
      actorRole: "manager",
      idempotencyKey: "station-grill-1",
      eventCount: 1,
    });
    expect(made.stepName).toMatch(/^Station\./);
    expect(typeof made.occurredAt).toBe("number");
    expect(retired).toMatchObject({
      stepName: "Station.retire",
      eventType: "StationRetired",
      subjectId: created.docId,
      idempotencyKey: null,
      versionAfter: (made.versionAfter ?? 0) + 1,
    });

    const events = await t.run(async (ctx) =>
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q) => q.eq("entityId", created.docId))
        .collect(),
    );
    expect(events.map((row) => row.type)).toContain("StationRetired");
    expect(String(retired.manifestEventId)).toBe(
      String(events.find((row) => row.type === "StationRetired")?._id),
    );

    // The manager's story of the record: who made it, every change after.
    const history = await mona.query(api.recordHistory.recordHistory, {
      recordId: created.docId,
    });
    expect(history?.changes).toHaveLength(2);
    expect(history?.madeBy).toMatchObject({
      byName: "Mona mona",
      byRole: "manager",
      retryKey: "station-grill-1",
      historyMissing: false,
    });
    expect(history?.changes[0]).toMatchObject({
      change: "StationRetired",
      step: "Station.retire",
      versionAfter: retired.versionAfter,
    });
  });

  it("never copies a secret a step was sent into history", async () => {
    const t = setup();
    const { as: mona } = await seedPerson(t, TENANT, "mona", "manager");
    await mona.mutation(api.mutations.AssistantLlmConfig_createViaConfigure, {
      baseUrl: "https://llm.proof.test",
      apiKey: SECRET,
      model: "proof-model",
    });
    await mona.mutation(api.pushSubscriptions.register, {
      endpoint: "https://push.proof.test/device-1",
      p256dh: "p256dh-proof",
      auth: "auth-proof-key",
    });
    const audits = await auditsOf(t, TENANT);
    expect(audits.map((row) => row.stepName)).toEqual(
      expect.arrayContaining([
        "AssistantLlmConfig.configure",
        "PushSubscription.PushSubscriptionRegistered",
      ]),
    );
    for (const row of audits) {
      expect(JSON.stringify(row)).not.toMatch(CREDENTIAL);
      expect(row.actorUserId).toBe("mona");
    }
    const ledger = await t.run(async (ctx) =>
      ctx.db.query("manifestEvents").collect(),
    );
    expect(JSON.stringify(ledger)).not.toMatch(CREDENTIAL);
  });

  it("a failed history write never undoes the step and is found by the check", async () => {
    const t = setup();
    const { as: mona } = await seedPerson(t, TENANT, "mona", "manager");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const kept = await t.run(async (ctx) => {
      const eventId = await ctx.db.insert("manifestEvents", {
        type: "StationRenamed",
        entity: "Station",
        entityId: "station-proof",
        payload: { tenantId: TENANT },
        createdAt: Date.now(),
      });
      const broken = {
        ...ctx,
        auth: ctx.auth,
        db: {
          ...ctx.db,
          get: ctx.db.get.bind(ctx.db),
          patch: ctx.db.patch.bind(ctx.db),
          insert: async () => {
            throw new Error("history store is down");
          },
        },
      };
      await recordCommandAudit(broken as never, {
        eventId: String(eventId),
        type: "StationRenamed",
        entity: "Station",
        entityId: "station-proof",
        command: "rename",
        emitIndex: 0,
        payload: { tenantId: TENANT },
        createdAt: Date.now(),
      });
      return await ctx.db.get(eventId);
    });
    expect(kept?.type).toBe("StationRenamed");
    expect(errors).toHaveBeenCalledWith(
      "[audit] step history not saved",
      "Station",
      "rename",
      expect.stringContaining("history store is down"),
    );
    errors.mockRestore();

    const check = await mona.query(api.recordHistory.auditCheck, { since: 0 });
    expect(check).toMatchObject({ checked: 1, missing: 1 });
    expect(check?.oldestMissingAt).toBe(kept?.createdAt);
  });

  it("keeps history inside its company and away from staff", async () => {
    const t = setup();
    const { as: mona } = await seedPerson(t, TENANT, "mona", "manager");
    const { as: otto } = await seedPerson(t, OTHER, "otto", "manager");
    const { as: sam } = await seedPerson(t, TENANT, "sam", "staff");
    const created = (await mona.mutation(
      api.mutations.Station_createViaDefine,
      {
        name: "Fryer",
      },
    )) as { docId: string };

    expect(
      await sam.query(api.recordHistory.recordHistory, {
        recordId: created.docId,
      }),
    ).toBeNull();
    expect(
      await sam.query(api.recordHistory.auditCheck, { since: 0 }),
    ).toBeNull();
    const foreign = await otto.query(api.recordHistory.recordHistory, {
      recordId: created.docId,
    });
    expect(foreign?.changes).toEqual([]);
    expect(
      await otto.query(api.recordHistory.auditCheck, { since: 0 }),
    ).toMatchObject({
      checked: 0,
      missing: 0,
    });
    expect(await auditsOf(t, OTHER)).toEqual([]);
  });

  it("every generated step writes an event row, so none escapes history (AC-193)", () => {
    const source = readFileSync("convex/mutations.ts", "utf8");
    const silent: string[] = [];
    for (const part of source.split(/\nexport const /).slice(1)) {
      const name = part.slice(0, part.indexOf(" "));
      if (!/= mutation\(/.test(part.slice(0, 200))) continue;
      const body = part.slice(0, part.indexOf("\n});"));
      let emits = body.includes("__handleManifestEvent(ctx");
      const run = body.match(/await (__run\w+)\(ctx/);
      if (!emits && run) {
        const start = source.indexOf(`async function ${run[1]}(`);
        emits = source
          .slice(start, source.indexOf("\n}\n", start))
          .includes("__handleManifestEvent(ctx");
      }
      if (!emits) silent.push(name);
    }
    expect(silent).toEqual([]);
  });
});
