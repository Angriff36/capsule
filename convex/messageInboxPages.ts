import { v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";

// PL-INBOX (AC-105): one page of a provider's message list, as its polling
// API hands it back. Every message goes through the same replay-safe intake
// as a single delivery, so a page fetched twice, two pages that overlap, or a
// restart from an older saved position adds no copy and no second lead. The
// next position is only handed back once every message on the page is
// stored or recorded as a failure, so a crash part-way repeats the page
// instead of skipping it. A message that cannot be read lands in the
// retryable failure list with its raw text.
const PAGE_LIST_KEYS = ["messages", "data", "items", "results"];
const CURSOR_KEYS = ["nextCursor", "next_cursor", "cursor", "nextPageToken"];

export const ingestProviderPage = action({
  args: {
    provider: v.string(),
    providerAccountId: v.optional(v.string()),
    rawJson: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    ingested: number;
    duplicates: number;
    failed: number;
    nextCursor: string | null;
  }> => {
    let page: unknown;
    try {
      page = JSON.parse(args.rawJson);
    } catch {
      // Hand the whole page to the single-delivery reader so the failure is
      // kept with its raw text, and do not move the saved position.
      await ctx.runAction(api.messageInbox.ingestProviderEnvelope, {
        provider: args.provider,
        providerAccountId: args.providerAccountId,
        rawJson: args.rawJson,
      });
      return { ingested: 0, duplicates: 0, failed: 1, nextCursor: null };
    }

    const body =
      page && typeof page === "object" && !Array.isArray(page)
        ? (page as Record<string, unknown>)
        : {};
    const list = Array.isArray(page)
      ? page
      : (PAGE_LIST_KEYS.map((key) => body[key]).find(Array.isArray) ?? []);
    const cursor = CURSOR_KEYS.map((key) => body[key]).find(
      (value): value is string =>
        typeof value === "string" && value.trim() !== "",
    );

    let ingested = 0;
    let duplicates = 0;
    let failed = 0;
    for (const envelope of list) {
      const result = await ctx.runAction(
        api.messageInbox.ingestProviderEnvelope,
        {
          provider: args.provider,
          providerAccountId: args.providerAccountId,
          rawJson: JSON.stringify(envelope),
        },
      );
      if (result.recorded === "sync_error") failed += 1;
      else if (result.isDuplicate) duplicates += 1;
      else ingested += 1;
    }
    return { ingested, duplicates, failed, nextCursor: cursor ?? null };
  },
});
