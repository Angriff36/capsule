/**
 * Runtime proof: the public /quote form is rate limited (abuse cap).
 *
 * submitQuote is anonymous, so it captures through the generated
 * QuoteSubmission.create (run as the tenant's system role), whose Manifest
 * `rateLimit { maxRequests: 60 windowMs: 60000 scope: global }` caps capture
 * volume. Proves both ways:
 *   - 60 distinct requests inside one minute succeed, the 61st is refused with
 *     the rate-limit denial and writes nothing;
 *   - a repeat submit of an already-captured request is still answered (the
 *     dedup runs before the command, so it never spends the budget), and the
 *     window slides: once the minute has passed, submits work again.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const LIMIT = 60;

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;
type Submitted = { submissionId: string; isDuplicate: boolean };

function submit(actor: Actor, n: number): Promise<Submitted> {
  const runner = actor as unknown as {
    action: (fn: unknown, args: unknown) => Promise<unknown>;
  };
  return runner.action(api.quoteBuilder.submitQuote, {
    clientName: `Visitor ${String(n)}`,
    email: `visitor${String(n)}@example.com`,
    eventDate: Date.UTC(2026, 10, 20, 17, 0),
    guestCount: 40,
    consent: true,
  }) as Promise<Submitted>;
}

async function capturedCount(actor: Actor): Promise<number> {
  return actor.run(
    async (ctx) => (await ctx.db.query("quoteSubmissions").collect()).length,
  );
}

describe("runtime proof: public quote capture rate limit", () => {
  it("accepts the limit, refuses the next request, keeps dedup and slides", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-quote-rate-limit",
      role: "owner",
      tenantId: "tenant-quote-rate-limit",
    });
    await proof.executeCommand(
      owner,
      api.mutations.Organization_createViaRegister,
      { name: "Rate limit kitchen" },
    );

    for (let n = 1; n <= LIMIT; n++) {
      const result = await submit(owner, n);
      expect(result.isDuplicate).toBe(false);
    }
    expect(await capturedCount(owner)).toBe(LIMIT);

    await expect(submit(owner, LIMIT + 1)).rejects.toThrow(
      /Rate limit exceeded/,
    );
    expect(await capturedCount(owner)).toBe(LIMIT);

    // A customer re-sending the request they already sent is still answered.
    const again = await submit(owner, 1);
    expect(again.isDuplicate).toBe(true);

    // Sliding window: age every recorded request past the minute.
    await owner.run(async (ctx) => {
      const buckets = (await ctx.db
        .query("commandRateLimitBuckets")
        .collect()) as Array<{ _id: string; timestamps: number[] }>;
      expect(buckets).toHaveLength(1);
      const past = Date.now() - 61_000;
      await ctx.db.patch(buckets[0]!._id as never, {
        windowStart: past,
        timestamps: buckets[0]!.timestamps.map(() => past),
      });
    });
    const afterWindow = await submit(owner, LIMIT + 1);
    expect(afterWindow.isDuplicate).toBe(false);
    expect(await capturedCount(owner)).toBe(LIMIT + 1);
  });
});
