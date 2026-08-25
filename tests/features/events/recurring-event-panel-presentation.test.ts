import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  RecurringEventPanelView,
  type RecurringEventPanelViewProps,
  type RecurringEventSnapshot,
} from "../../../src/features/events/RecurringEventPanel";
import type { Id } from "../../../src/lib/api";

vi.mock("../../../src/lib/manifest-convex-react", () => ({
  useEventStopRecurrence: () => vi.fn(),
}));

vi.mock("../../../src/lib/recurringEventActions", () => ({
  useConfigureRecurringEvent: () => vi.fn(),
}));

const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
// 20 days back keeps weekly boundaries unambiguous: drafts land 13 days ago,
// 6 days ago (past), then 1 day ahead (future) — never exactly at "now".
const PAST_ANCHOR_OFFSET_MS = 20 * DAY_MS;
const noop = async () => undefined;

function renderPanel(
  startsAt: number | null,
  recurrence: RecurringEventSnapshot,
  overrides: Partial<RecurringEventPanelViewProps> = {},
): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {},
      createElement(RecurringEventPanelView, {
        startsAt,
        recurrence,
        canConfigure: true,
        busy: false,
        onConfigure: noop,
        onStop: noop,
        ...overrides,
      }),
    ),
  );
}

describe("RecurringEventPanelView", () => {
  it("marks an active series whose next Draft date already passed as overdue", () => {
    const html = renderPanel(Date.now() - 3 * WEEK_MS, {
      recurrenceFrequency: "weekly",
      recurrenceActive: true,
      recurrenceNextStartsAt: Date.now() - WEEK_MS,
      recurrenceGeneratedCount: 3,
    });
    expect(html).toContain("(overdue)");
  });

  it("does not mark a future next Draft as overdue", () => {
    const html = renderPanel(Date.now() - WEEK_MS, {
      recurrenceFrequency: "weekly",
      recurrenceActive: true,
      recurrenceNextStartsAt: Date.now() + WEEK_MS,
      recurrenceGeneratedCount: 3,
    });
    expect(html).not.toContain("(overdue)");
  });

  it("warns on a source Event whose own date is already past", () => {
    const html = renderPanel(Date.now() - PAST_ANCHOR_OFFSET_MS, {});
    expect(html).toContain("recurrence-past-warning");
    expect(html).toContain("already in the past");
  });

  it("does not warn on a future source Event", () => {
    const html = renderPanel(Date.now() + WEEK_MS, {});
    expect(html).not.toContain("recurrence-past-warning");
  });

  it("does not warn on a recurrence-instance child, even when past", () => {
    const html = renderPanel(Date.now() - PAST_ANCHOR_OFFSET_MS, {
      recurrenceTemplateEventId: "evt_template" as Id<"events">,
      recurrenceSequence: 2,
    });
    expect(html).not.toContain("recurrence-past-warning");
  });

  it("labels the first strictly-future Draft and counts past series dates", () => {
    const html = renderPanel(Date.now() - PAST_ANCHOR_OFFSET_MS, {});
    expect(html).toContain("First future Draft:");
    expect(html).toContain(
      "2 earlier dates in this series are already past and will land as overdue Drafts.",
    );
  });

  it("says no further Drafts when the occurrence limit ends the series in the past", () => {
    const html = renderPanel(Date.now() - PAST_ANCHOR_OFFSET_MS, {
      recurrenceEndCondition: "after_occurrences",
      recurrenceOccurrenceLimit: 3,
    });
    expect(html).toContain(
      "No further Drafts: this schedule ends before any date after today.",
    );
    expect(html).not.toContain("First future Draft:");
  });
});
