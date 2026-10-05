/**
 * AC-634 (BE-17.2): one delivery-state meaning for every outbound channel
 * (convex/lib/deliveryState.ts). It keeps pending, processing, delivered,
 * retryable_failed and terminal_failed (plus uncertain for a send whose
 * answer was lost), and reports attempt count, next retry time, provider id,
 * a safe error class and the last response code. The words a person sees come
 * from a fixed list, never from a provider message.
 */
import { describe, expect, it } from "vitest";
import {
  classifyDeliveryError,
  deliveryErrorLabel,
  isDue,
  retryDelayMs,
  summarizeDelivery,
  type DeliveryAttemptRow,
  type DeliveryErrorClass,
} from "../../convex/lib/deliveryState";

const MINUTE = 60_000;
const NOW = 1_000 * MINUTE;

function failed(
  minutesAgo: number,
  errorClass: DeliveryErrorClass = "provider_down",
  httpStatus: number | null = 503,
): DeliveryAttemptRow {
  return {
    outcome: "failed",
    at: NOW - minutesAgo * MINUTE,
    errorClass,
    httpStatus,
  };
}

describe("AC-634 delivery states", () => {
  it("covers every state with attempt count, next retry, provider id and last response", () => {
    expect(summarizeDelivery([], NOW)).toMatchObject({
      state: "pending",
      attemptCount: 0,
      nextRetryAt: null,
    });

    expect(
      summarizeDelivery([{ outcome: "started", at: NOW - MINUTE }], NOW),
    ).toMatchObject({ state: "processing", attemptCount: 1 });

    expect(
      summarizeDelivery([{ outcome: "started", at: NOW - 10 * MINUTE }], NOW),
    ).toMatchObject({ state: "uncertain", attemptCount: 1, nextRetryAt: null });

    const retryable = summarizeDelivery([failed(0.5)], NOW);
    expect(retryable).toMatchObject({
      state: "retryable_failed",
      attemptCount: 1,
      nextRetryAt: NOW - 0.5 * MINUTE + MINUTE,
      errorClass: "provider_down",
      lastHttpStatus: 503,
    });
    expect(isDue(retryable, NOW)).toBe(false);
    expect(isDue(retryable, NOW + MINUTE)).toBe(true);

    expect(
      summarizeDelivery([failed(9), failed(7), failed(3)], NOW),
    ).toMatchObject({
      state: "terminal_failed",
      attemptCount: 3,
      nextRetryAt: null,
    });

    expect(
      summarizeDelivery(
        [
          failed(9),
          {
            outcome: "succeeded",
            at: NOW - 2 * MINUTE,
            providerId: "msg_1",
            httpStatus: 200,
          },
        ],
        NOW,
      ),
    ).toMatchObject({
      state: "delivered",
      attemptCount: 2,
      providerId: "msg_1",
      lastHttpStatus: 200,
      errorClass: null,
    });
  });

  it("waits double each time, up to one hour", () => {
    expect([1, 2, 3, 4].map((n) => retryDelayMs(n) / MINUTE)).toEqual([
      1, 2, 4, 8,
    ]);
    expect(retryDelayMs(20)).toBe(60 * MINUTE);
  });

  it("a person's try again starts a fresh budget; a success is never undone", () => {
    const reopened = summarizeDelivery(
      [
        failed(9),
        failed(7),
        failed(5),
        { outcome: "retry_requested", at: NOW - MINUTE },
      ],
      NOW,
    );
    expect(reopened).toMatchObject({ state: "pending", attemptCount: 0 });
    expect(isDue(reopened, NOW)).toBe(true);

    const delivered = summarizeDelivery(
      [
        { outcome: "succeeded", at: NOW - 5 * MINUTE },
        { outcome: "retry_requested", at: NOW - MINUTE },
      ],
      NOW,
    );
    expect(delivered.state).toBe("delivered");
    expect(isDue(delivered, NOW)).toBe(false);
  });

  it("a crash after the provider took the send is not a fresh try", () => {
    const rows: DeliveryAttemptRow[] = [
      failed(9),
      { outcome: "started", at: NOW - 6 * MINUTE },
    ];
    const summary = summarizeDelivery(rows, NOW);
    expect(summary).toMatchObject({ state: "uncertain", attemptCount: 2 });
    expect(isDue(summary, NOW)).toBe(false);

    // Every lost send counts, so lost sends can never repeat forever; a
    // claim followed by its own failure is one try, not two.
    expect(
      summarizeDelivery(
        [
          { outcome: "started", at: NOW - 30 * MINUTE },
          { outcome: "started", at: NOW - 20 * MINUTE },
          { outcome: "started", at: NOW - 10 * MINUTE },
        ],
        NOW,
      ),
    ).toMatchObject({ state: "uncertain", attemptCount: 3 });
    expect(
      summarizeDelivery(
        [{ outcome: "started", at: NOW - 3 * MINUTE }, { ...failed(2.9) }],
        NOW,
      ),
    ).toMatchObject({ state: "retryable_failed", attemptCount: 1 });
  });

  it("classifies errors safely and stops at once on errors that will not fix themselves", () => {
    expect(classifyDeliveryError({ httpStatus: 429 })).toBe("throttled");
    expect(classifyDeliveryError({ httpStatus: 401 })).toBe("not_authorized");
    expect(classifyDeliveryError({ httpStatus: 410 })).toBe("not_found");
    expect(classifyDeliveryError({ httpStatus: 422 })).toBe("rejected");
    expect(classifyDeliveryError({ httpStatus: 502 })).toBe("provider_down");
    expect(classifyDeliveryError({ timedOut: true })).toBe("timeout");
    expect(classifyDeliveryError({ networkFailure: true })).toBe("network");

    expect(summarizeDelivery([failed(1, "throttled", 429)], NOW).state).toBe(
      "retryable_failed",
    );
    expect(
      summarizeDelivery([failed(1, "not_authorized", 401)], NOW).state,
    ).toBe("terminal_failed");

    const labels = (
      [
        "timeout",
        "throttled",
        "not_authorized",
        "not_found",
        "rejected",
        "provider_down",
        "network",
        "not_set_up",
        "unknown",
      ] as const
    ).map(deliveryErrorLabel);
    for (const label of labels) {
      expect(label).not.toMatch(/token|key|secret|https?:|@/i);
    }
  });
});
