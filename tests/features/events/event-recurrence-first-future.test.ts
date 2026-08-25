import { describe, expect, it } from "vitest";
import {
  firstFutureRecurringOccurrence,
  recurringEventStartsAt,
} from "../../../src/lib/eventRecurrence";

const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

// The production bug scenario: base event Jul 30, 2026 4:00 PM PDT viewed on
// Aug 19, 2026. Weekly drafts land Aug 6, Aug 13 (past) and Aug 20 (future).
const anchorStartsAt = Date.UTC(2026, 6, 30, 23, 0, 0);
const now = Date.UTC(2026, 7, 19, 15, 30, 0);

describe("firstFutureRecurringOccurrence", () => {
  it("selects the first occurrence strictly after now for a past weekly anchor", () => {
    const occurrence = firstFutureRecurringOccurrence(
      anchorStartsAt,
      "weekly",
      now,
    );
    expect(occurrence).not.toBeNull();
    // Aug 20, not the stale Aug 6 (sequence 2) the panel used to show.
    expect(occurrence?.startsAt).toBe(anchorStartsAt + 3 * WEEK_MS);
    expect(occurrence?.sequence).toBe(4);
    expect(occurrence?.pastDraftCount).toBe(2);
  });

  it("excludes an occurrence whose start equals now (strictly after)", () => {
    const sequenceTwoStartsAt = recurringEventStartsAt(
      anchorStartsAt,
      "weekly",
      2,
    );
    const occurrence = firstFutureRecurringOccurrence(
      anchorStartsAt,
      "weekly",
      sequenceTwoStartsAt,
    );
    expect(occurrence?.sequence).toBe(3);
    expect(occurrence?.startsAt).toBe(anchorStartsAt + 2 * WEEK_MS);
    expect(occurrence?.pastDraftCount).toBe(1);
  });

  it("keeps sequence 2 for a future-anchored series", () => {
    const futureAnchor = now + DAY_MS;
    const occurrence = firstFutureRecurringOccurrence(
      futureAnchor,
      "weekly",
      now,
    );
    expect(occurrence?.sequence).toBe(2);
    expect(occurrence?.startsAt).toBe(futureAnchor + WEEK_MS);
    expect(occurrence?.pastDraftCount).toBe(0);
  });

  it("does not invent a Draft beyond the occurrence limit the materializer stops at", () => {
    // With limit 3 the materializer stopped at sequence 3 (Aug 13); Aug 20
    // (sequence 4) will never exist and must not be labeled as upcoming.
    const occurrence = firstFutureRecurringOccurrence(
      anchorStartsAt,
      "weekly",
      now,
      { endCondition: "after_occurrences", occurrenceLimit: 3 },
    );
    expect(occurrence).toBeNull();
  });

  it("returns Aug 20 when the occurrence limit still includes it", () => {
    const occurrence = firstFutureRecurringOccurrence(
      anchorStartsAt,
      "weekly",
      now,
      { endCondition: "after_occurrences", occurrenceLimit: 4 },
    );
    expect(occurrence?.startsAt).toBe(anchorStartsAt + 3 * WEEK_MS);
    expect(occurrence?.pastDraftCount).toBe(2);
  });

  it("returns null when the end date falls before any future occurrence", () => {
    const occurrence = firstFutureRecurringOccurrence(
      anchorStartsAt,
      "weekly",
      now,
      // Ends Aug 13 — every remaining series date is already past.
      {
        endCondition: "on_date",
        recurrenceEndsAt: anchorStartsAt + 2 * WEEK_MS,
      },
    );
    expect(occurrence).toBeNull();
  });
});
