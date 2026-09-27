/**
 * Runtime proof (PL-AUTH, AC-151 removed person): the in-app assistant
 * settings and the company AI key followed any staff profile that was not
 * deleted, so a removed (inactive) person still saw the settings and could
 * still run the assistant on the company's key. Now the lookup uses the same
 * live-person rule as sign-in. Synthetic workspace only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
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
    ).toMatchObject({ apiKey: "proof-key" });

    expect(
      await as("removed-a").query(api.assistantConfig.forCaller, {}),
    ).toEqual({
      configured: false,
    });
    expect(
      await t.query(internal.assistantConfig.readForSubject, {
        subject: "removed-a",
      }),
    ).toBeNull();
  });
});
