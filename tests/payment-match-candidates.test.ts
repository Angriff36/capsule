import { describe, expect, it } from "vitest";
import {
  paymentMatchCandidates,
  readImportedPayment,
  type MatchablePayment,
} from "../src/lib/paymentMatchCandidates";

const DAY = 24 * 60 * 60 * 1000;
const june20 = Date.UTC(2026, 5, 20);

const row = (raw: Record<string, unknown>) =>
  readImportedPayment({
    externalId: String(raw.externalId ?? "P-1"),
    rawSourceData: JSON.stringify(raw),
  });

const payments: MatchablePayment[] = [
  { _id: "far", amount: 900, occurredAt: june20 + 20 * DAY },
  { _id: "near", amount: 900, occurredAt: june20 + DAY },
  { _id: "other-amount", amount: 899.99, occurredAt: june20 },
  { _id: "failed", amount: 900, status: "failed", occurredAt: june20 },
  { _id: "qb", amount: 100, externalPaymentId: "QB-1" },
];

describe("payment match candidates (AC-284, AC-623)", () => {
  it("the same id is an exact match; nothing else is offered beside it", () => {
    const result = paymentMatchCandidates(
      row({ externalId: "P-1", amount: 100, providerTransactionId: "QB-1" }),
      payments,
    );
    expect(result).toEqual({ exactPaymentId: "qb", suggestions: [] });
  });

  it("same amount only suggests, closest date first; failed payments and other amounts are left out", () => {
    const result = paymentMatchCandidates(
      row({ externalId: "P-2", amount: 900, recordedAt: june20 }),
      payments,
    );
    expect(result.exactPaymentId).toBeNull();
    expect(result.suggestions).toEqual([
      { paymentId: "near", daysApart: 1 },
      { paymentId: "far", daysApart: 20 },
    ]);
  });

  it("a payment already matched by another row is not offered", () => {
    const result = paymentMatchCandidates(
      row({ externalId: "P-1", amount: 100, providerTransactionId: "QB-1" }),
      payments,
      new Set(["qb"]),
    );
    expect(result).toEqual({ exactPaymentId: null, suggestions: [] });
  });

  it("reads what the import kept, and survives a broken row", () => {
    expect(
      row({
        externalId: "P-9",
        amount: 25,
        method: "check",
        eventId: "EV-1",
        invoiceId: 77,
      }),
    ).toMatchObject({
      externalId: "P-9",
      amount: 25,
      method: "check",
      eventRef: "EV-1",
      invoiceRef: "77",
    });
    expect(
      readImportedPayment({ externalId: "X", rawSourceData: "{not json" }),
    ).toMatchObject({ externalId: "X", amount: null });
  });
});
