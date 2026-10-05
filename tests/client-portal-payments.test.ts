// @vitest-environment jsdom
/**
 * AC-102 screen leg: the portal pay card and the return page tell the client
 * the truth - received (with what is still owed), not finished yet (with a
 * way to check again), or did not go through - and a double press starts
 * one payment.
 */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { getFunctionName } from "convex/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

const actions = vi.hoisted(() => ({
  start: vi.fn(),
  check: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useAction: (reference: never) =>
    getFunctionName(reference).endsWith("startPayment")
      ? actions.start
      : actions.check,
}));

import { ClientPortalPayments } from "../src/features/clientPortal/ClientPortalPayments";

const invoice = {
  _id: "inv1",
  invoiceNumber: "INV-7",
  amountPaid: 0,
  amountDue: 1000,
  currencyCode: "USD",
  payable: { deposit: 250, balance: 1000 },
};

let container: HTMLDivElement | null = null;
afterEach(() => {
  container?.remove();
  container = null;
  actions.start.mockReset();
  actions.check.mockReset();
  window.history.replaceState({}, "", "/");
});

async function mount() {
  container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(ClientPortalPayments, {
        token: "tok",
        invoices: [invoice],
        online: true,
        companyName: "Garden Catering",
      }),
    ),
  );
  return { root, element: container };
}

describe("client portal payments", () => {
  it("shows a received payment with what is still owed", async () => {
    window.history.replaceState(
      {},
      "",
      "/portal/events/tok?payment=return&invoice=inv1&session_id=cs_1",
    );
    actions.check.mockResolvedValue({
      outcome: "succeeded",
      amountPaid: 250,
      amountDue: 750,
      overpaid: 0,
      currencyCode: "USD",
    });
    const { root, element } = await mount();
    expect(actions.check).toHaveBeenCalledWith({
      token: "tok",
      invoiceId: "inv1",
      sessionId: "cs_1",
    });
    expect(element.textContent).toContain(
      "Payment received, thank you. Still owed: $750.00.",
    );
    await act(async () => root.unmount());
  });

  it("says not finished yet and lets the client check again", async () => {
    window.history.replaceState(
      {},
      "",
      "/portal/events/tok?payment=return&invoice=inv1&session_id=cs_1",
    );
    actions.check.mockResolvedValueOnce({
      outcome: "pending",
      amountPaid: 0,
      amountDue: 1000,
      overpaid: 0,
      currencyCode: "USD",
    });
    actions.check.mockResolvedValueOnce({
      outcome: "failed",
      amountPaid: 0,
      amountDue: 1000,
      overpaid: 0,
      currencyCode: "USD",
    });
    const { root, element } = await mount();
    expect(element.textContent).toContain("Your payment is not finished yet.");
    const again = Array.from(element.querySelectorAll("button")).find(
      (button) => button.textContent === "Check again",
    )!;
    await act(async () => again.click());
    expect(actions.check).toHaveBeenCalledTimes(2);
    expect(element.textContent).toContain(
      "This payment didn't go through, and you were not charged.",
    );
    await act(async () => root.unmount());
  });

  it("a double press starts one payment", async () => {
    let finish: (value: unknown) => void = () => {};
    actions.start.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { root, element } = await mount();
    const pay = Array.from(element.querySelectorAll("button")).find((button) =>
      button.textContent?.startsWith("Pay deposit"),
    )!;
    expect(pay.textContent).toBe("Pay deposit $250.00");
    await act(async () => {
      pay.click();
      pay.click();
    });
    expect(actions.start).toHaveBeenCalledTimes(1);
    expect(actions.start).toHaveBeenCalledWith({
      token: "tok",
      invoiceId: "inv1",
      part: "deposit",
    });
    await act(async () => finish({ status: "nothing_due" }));
    expect(element.textContent).toContain(
      "Nothing is due on this invoice right now.",
    );
    await act(async () => root.unmount());
  });
});
