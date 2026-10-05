/**
 * PL-OFFLINE-TIME (AC-127, AC-139): the phone says which taps are only saved
 * on the phone, which the office refused and why (a conflict reads as
 * "Someone else changed this"), and lets the worker drop a refused one.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfflineStatusBar } from "../../../src/features/staff/MyDayFrame";

const action = (over: object) => ({
  id: "a1",
  runKey: "clock-in",
  label: "Clock in",
  args: {},
  idempotencyKey: "k1",
  queuedAt: Date.UTC(2026, 9, 18, 17, 2),
  ...over,
});

describe("pending versus confirmed on the phone", () => {
  it("names waiting taps, explains a refused one, and offers to drop it", () => {
    const html = renderToStaticMarkup(
      createElement(OfflineStatusBar, {
        online: true,
        pending: [
          action({}),
          action({
            id: "a2",
            runKey: "pack-mark-packed",
            label: "Mark packed",
            lastError:
              "ConcurrencyConflict: VERSION_MISMATCH expected 3 actual 4",
          }),
        ],
        onRetry: () => undefined,
        onDrop: () => undefined,
      }),
    );
    expect(html).toContain("Clock in — waiting to send");
    expect(html).toContain(
      "Mark packed — not saved yet: Someone else changed this",
    );
    expect(html.match(/Drop it/g)).toHaveLength(1);
  });
});
