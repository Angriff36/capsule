/**
 * Runtime proof (PL-AUTH, AC-151 removed person): the in-app assistant
 * settings and the company AI key followed any staff profile that was not
 * deleted, so a removed (inactive) person still saw the settings and could
 * still run the assistant on the company's key. Now the lookup uses the same
 * live-person rule as sign-in. Synthetic workspace only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("assistant settings follow only active staff profiles", () => {
  it("a removed person no longer sees the settings or uses the company key", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("assistantLlmConfigs", {
        tenantId: "tenant-a",
        baseUrl: "https://llm.example.test",
        apiKey: "proof-key",
        model: "proof-model",
        version: 1,
      } as never);
      for (const [subject, status] of [
        ["active-a", "active"],
        ["removed-a", "inactive"],
      ] as const) {
        await ctx.db.insert("people", {
          tenantId: "tenant-a",
          givenName: "Proof",
          familyName: subject,
          email: `${subject}@example.test`,
          role: "owner",
          employmentType: "full_time",
          status,
          authSubjectId: subject,
          version: 1,
        } as never);
      }
    });
    const as = (subject: string) =>
      t.withIdentity({ subject, tokenIdentifier: `proof|${subject}` });

    expect(
      await as("active-a").query(api.assistantConfig.forCaller, {}),
    ).toMatchObject({
      configured: true,
      model: "proof-model",
    });
    expect(
      await t.query(internal.assistantConfig.readForSubject, {
        subject: "active-a",
      }),
    ).toMatchObject({ staff: true, settings: { apiKey: "proof-key" } });

    expect(
      await as("removed-a").query(api.assistantConfig.forCaller, {}),
    ).toEqual({
      configured: false,
    });
    expect(
      await t.query(internal.assistantConfig.readForSubject, {
        subject: "removed-a",
      }),
    ).toEqual({ staff: false });
  });

  it("the assistant turn refuses removed and unlinked people even when a fallback key is set", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const [subject, status] of [
        ["live-b", "active"],
        ["removed-b", "inactive"],
      ] as const) {
        await ctx.db.insert("people", {
          tenantId: "tenant-b",
          givenName: "Proof",
          familyName: subject,
          email: `${subject}@example.test`,
          role: "owner",
          employmentType: "full_time",
          status,
          authSubjectId: subject,
          version: 1,
        } as never);
      }
    });
    const as = (subject: string) =>
      t.withIdentity({ subject, tokenIdentifier: `proof|${subject}` });
    const keysSent: string[] = [];
    vi.stubEnv("ASSISTANT_LLM_BASE_URL", "https://fallback.example.test/v1");
    vi.stubEnv("ASSISTANT_LLM_API_KEY", "fallback-key");
    vi.stubEnv("ASSISTANT_LLM_MODEL", "fallback-model");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        keysSent.push(
          String((init.headers as Record<string, string>).Authorization),
        );
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "hello" } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    try {
      const messages = [{ role: "user" as const, content: "hi" }];
      for (const subject of ["removed-b", "never-linked"]) {
        await expect(
          as(subject).action(api.assistantTurn.turn, { messages }),
        ).rejects.toThrow(/No staff profile is linked/);
      }
      expect(keysSent).toEqual([]);

      // Control: live staff with no company settings still use the fallback.
      expect(
        await as("live-b").action(api.assistantTurn.turn, { messages }),
      ).toMatchObject({ content: "hello" });
      expect(keysSent).toEqual(["Bearer fallback-key"]);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("follows the workspace the sign-in claims, not just any live profile", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      // The same sign-in is linked to one profile per workspace: removed
      // (inactive) from A, still live in B.
      await ctx.db.insert("assistantLlmConfigs", {
        tenantId: "tenant-claim-a",
        baseUrl: "https://a.example.test",
        apiKey: "key-a",
        model: "model-a",
        version: 1,
      } as never);
      await ctx.db.insert("assistantLlmConfigs", {
        tenantId: "tenant-claim-b",
        baseUrl: "https://b.example.test",
        apiKey: "key-b",
        model: "model-b",
        version: 1,
      } as never);
      for (const [tenantId, status] of [
        ["tenant-claim-a", "inactive"],
        ["tenant-claim-b", "active"],
      ] as const) {
        await ctx.db.insert("people", {
          tenantId,
          givenName: "Dual",
          familyName: tenantId,
          email: `dual-${tenantId}@example.test`,
          role: "owner",
          employmentType: "full_time",
          status,
          authSubjectId: "dual-workspace",
          version: 1,
        } as never);
      }
    });
    // Presenting workspace A's claims (as the sign-in still does after the
    // removal): A's settings and key are out of reach.
    const asA = t.withIdentity({
      subject: "dual-workspace",
      tokenIdentifier: "proof|dual",
      tenantId: "tenant-claim-a",
    });
    expect(await asA.query(api.assistantConfig.forCaller, {})).toEqual({
      configured: false,
    });
    expect(
      await t.query(internal.assistantConfig.readForSubject, {
        subject: "dual-workspace",
        tenantId: "tenant-claim-a",
      }),
    ).toEqual({ staff: false });

    // The same sign-in in its live workspace B still works and gets B's key.
    const asB = t.withIdentity({
      subject: "dual-workspace",
      tokenIdentifier: "proof|dual",
      tenantId: "tenant-claim-b",
    });
    expect(await asB.query(api.assistantConfig.forCaller, {})).toMatchObject({
      configured: true,
      model: "model-b",
    });
    expect(
      await t.query(internal.assistantConfig.readForSubject, {
        subject: "dual-workspace",
        tenantId: "tenant-claim-b",
      }),
    ).toMatchObject({ staff: true, settings: { apiKey: "key-b" } });
  });
});
