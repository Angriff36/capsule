/**
 * Runtime proof: the public /quote form is rate limited per submitter.
 *
 * submitQuote captures through the generated QuoteSubmission.create run as a
 * system actor keyed on the SHA-256 of the submitter's normalized email; the
 * command's `rateLimit { maxRequests: 5 windowMs: 3600000 scope: user }`
 * therefore gives every submitter their own bucket. Proves both ways:
 *   - one address: 5 new requests accepted, the 6th refused with the
 *     rate-limit denial and nothing written;
 *   - another customer is still accepted while that address is blocked
 *     (a flood cannot starve legitimate inquiries);
 *   - a repeat of an already-captured request is still answered (dedup runs
 *     first, as one indexed point read, and never spends the budget);
 *   - the bucket key does not contain the email; the window slides.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import {
  ingressQuoteSubmission,
  quoteSubmitterKey,
} from "../../convex/quoteBuilder";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";

const LIMIT = 5;

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(ensureTestFieldEncryptionKey);

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;
type Submitted = { submissionId: string; isDuplicate: boolean };

/** Request `n` from `email`: a distinct event date makes a distinct request. */
function submit(actor: Actor, email: string, n: number): Promise<Submitted> {
  const runner = actor as unknown as {
    action: (fn: unknown, args: unknown) => Promise<unknown>;
  };
  return runner.action(api.quoteBuilder.submitQuote, {
    clientName: `Visitor ${email}`,
    email,
    eventDate: Date.UTC(2026, 10, n, 17, 0),
    guestCount: 40,
    consent: true,
  }) as Promise<Submitted>;
}

async function capturedFor(actor: Actor, email: string): Promise<number> {
  return actor.run(
    async (ctx) =>
      (await ctx.db.query("quoteSubmissions").collect()).filter(
        (row) => (row as { email?: string }).email === email,
      ).length,
  );
}

describe("runtime proof: public quote capture rate limit", () => {
  it("caps one submitter without blocking others, keeps dedup and slides", async () => {
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

    const flooder = "flood@example.com";
    for (let n = 1; n <= LIMIT; n++) {
      expect((await submit(owner, flooder, n)).isDuplicate).toBe(false);
    }
    await expect(submit(owner, flooder, LIMIT + 1)).rejects.toThrow(
      /Rate limit exceeded/,
    );
    expect(await capturedFor(owner, flooder)).toBe(LIMIT);

    // A real customer is unaffected by the flooding address.
    const customer = "real.customer@example.com";
    expect((await submit(owner, customer, 1)).isDuplicate).toBe(false);
    expect(await capturedFor(owner, customer)).toBe(1);

    // Re-sending an already captured request is still answered.
    expect((await submit(owner, flooder, 1)).isDuplicate).toBe(true);

    const flooderKey = `QuoteSubmission_create:user:capsule-system:tenant-quote-rate-limit:${await quoteSubmitterKey(flooder)}`;
    await owner.run(async (ctx) => {
      const buckets = (await ctx.db
        .query("commandRateLimitBuckets")
        .collect()) as Array<{
        _id: string;
        scopeKey: string;
        timestamps: number[];
      }>;
      expect(buckets).toHaveLength(2);
      for (const bucket of buckets) expect(bucket.scopeKey).not.toContain("@");
      const bucket = buckets.find((row) =>
        row.scopeKey.endsWith(flooderKey.split(":").pop()!),
      )!;
      // Sliding window: age the flooder's requests past the hour.
      const past = Date.now() - 3_600_001;
      await ctx.db.patch(bucket._id as never, {
        windowStart: past,
        timestamps: bucket.timestamps.map(() => past),
      });
    });
    expect((await submit(owner, flooder, LIMIT + 1)).isDuplicate).toBe(false);
    expect(await capturedFor(owner, flooder)).toBe(LIMIT + 1);
  });

  it("answers a duplicate with one indexed point read, before any command runs", async () => {
    const reads: Array<{ table: string; index: string; eqs: string[] }> = [];
    const existing = {
      _id: "sub_1",
      tenantId: "t1",
      dedupKey: "k",
      status: "pending",
      deletedAt: null,
    };
    const ctx = {
      db: {
        query: (table: string) => ({
          filter: () => ({ first: async () => ({ tenantId: "t1" }) }),
          withIndex: (index: string, range: (q: unknown) => unknown) => {
            const eqs: string[] = [];
            const q = {
              eq: (field: string) => {
                eqs.push(field);
                return q;
              },
            };
            range(q);
            reads.push({ table, index, eqs });
            return { collect: async () => [existing] };
          },
          collect: async () => {
            throw new Error(`full scan of ${table}`);
          },
        }),
        get: async () => null,
      },
      runMutation: () => {
        throw new Error("the command must not run for a duplicate");
      },
    };
    const handler = (
      ingressQuoteSubmission as unknown as {
        _handler: (ctx: unknown, args: unknown) => Promise<Submitted>;
      }
    )._handler;
    const result = await handler(ctx, {
      clientName: "Dup",
      email: "dup@example.com",
      phone: "",
      eventDate: Date.UTC(2026, 10, 1),
      eventEndTime: 0,
      guestCount: 10,
      serviceStyleText: "",
      occasionText: "",
      venueName: "",
      venueAddress: "",
      menuPreferences: "",
      dietaryRestrictions: "",
      notes: "",
    });
    expect(result.isDuplicate).toBe(true);
    expect(reads).toEqual([
      {
        table: "quoteSubmissions",
        index: "by_tenantId_and_dedupKey",
        eqs: ["tenantId", "dedupKey"],
      },
    ]);
  });
});
