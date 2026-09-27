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
});
