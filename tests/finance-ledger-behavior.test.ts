// @vitest-environment jsdom
import { createElement } from "react";
import { Route, Routes } from "react-router-dom";
import { expect, it } from "vitest";
import {
  backend,
  container,
  mount,
  command,
  button,
  click,
} from "./support/mounted-app";
import { InvoicesPage } from "../src/features/finance/InvoicesPage";
import { InvoiceDetailPage } from "../src/features/finance/InvoiceDetailPage";
import { PaymentsPage } from "../src/features/finance/PaymentsPage";

const invoiceId = "nn7ez3fz56ya246m6p17az2ad58crnwg";
it("excludes zero-balance rows from individual and bulk sends while sending each positive invoice once", async () => {
  backend.values.set(
    "useListInvoice",
    [0, 900, 0, 3600].map((amount, index) => ({
      _id: `invoice-${index}`,
      invoiceNumber: `INV-${index}`,
      clientId: "client-a",
      status: "draft",
      amountDue: amount,
      total: amount,
      version: index + 1,
    })),
  );
  const send = command("useInvoiceSend");
  await mount(createElement(InvoicesPage));
  const rows = [...container.querySelectorAll("tbody tr")];
  expect(rows).toHaveLength(4);
  for (const index of [0, 2]) {
    expect(rows[index].querySelector('input[type="checkbox"]')).toBeNull();
    expect(rows[index].textContent).not.toContain("Record sent");
    expect(rows[index].textContent).toContain("Void");
  }
  await click(button("Record sent", rows[1]));
  expect(send).toHaveBeenCalledExactlyOnceWith({
    docId: "invoice-1",
    version: 2,
  });
  expect(container.textContent).toContain(
    "Share the invoice or payment link through your external channel",
  );
  send.mockClear();
  await click(
    container.querySelector<HTMLInputElement>(
      '[aria-label="Select all sendable invoices"]',
    )!,
  );
  await click(button("Record 2 sent"));
  expect(send.mock.calls).toEqual([
    [{ docId: "invoice-1", version: 2 }],
    [{ docId: "invoice-3", version: 4 }],
  ]);
  expect(container.textContent).toContain(
    "2 invoices marked sent in Capsule. Deliver them through your external channel.",
  );
});

it("updates invoice-detail send eligibility with the live balance and links to the originating client and event", async () => {
  const invoice = {
    _id: invoiceId,
    invoiceNumber: "INV-204",
    clientId: "client-a",
    eventId: "event-a",
    status: "draft",
    amountDue: 0,
    total: 120,
    amountPaid: 120,
    version: 7,
  };
  backend.values.set("useGetInvoice", invoice);
  backend.values.set("useListClient", [
    { _id: "client-a", companyName: "Garden Club", clientType: "company" },
  ]);
  backend.values.set("useListEvent", [
    { _id: "event-a", title: "Spring banquet" },
  ]);
  command("invoiceReminders:getSchedule", null);
  command("invoicePayments:getPaymentLink", null);
  const send = command("useInvoiceSend");
  const page = () =>
    createElement(
      Routes,
      null,
      createElement(Route, {
        path: "/finance/invoices/:id",
        element: createElement(InvoiceDetailPage),
      }),
    );
  await mount(page(), `/finance/invoices/${invoiceId}`);
  expect(
    container.querySelector('a[href="/clients/client-a"]')?.textContent,
  ).toContain("Garden Club");
  expect(
    container.querySelector('a[href="/events/event-a"]')?.textContent,
  ).toContain("Spring banquet");
  expect(
    [...container.querySelectorAll("button")].some(
      (node) => node.textContent === "Record sent",
    ),
  ).toBe(false);
  backend.values.set("useGetInvoice", {
    ...invoice,
    amountDue: 120,
    amountPaid: 0,
    version: 8,
  });
  await mount(page());
  await click(button("Record sent"));
  expect(send).toHaveBeenCalledExactlyOnceWith({
    docId: invoiceId,
    version: 8,
  });
});

it("shows the hidden settled total and reveals the actual payments in one click", async () => {
  backend.values.set("useListPayment", [
    {
      _id: "payment-a",
      invoiceId,
      status: "completed",
      amount: 11700,
      settledAt: 1,
    },
    {
      _id: "payment-b",
      invoiceId,
      status: "completed",
      amount: 3600,
      settledAt: 2,
    },
  ]);
  backend.values.set("useListInvoice", [
    { _id: invoiceId, invoiceNumber: "INV-204" },
  ]);
  await mount(createElement(PaymentsPage));
  expect(container.textContent).toContain("0 open · 2 settled");
  expect(container.textContent).toContain("2 completed payments");
  expect(container.textContent).toContain("$15,300.00");
  expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
  await click(
    button(
      "Show 2 settled payments",
      container.querySelector(".document-empty")!,
    ),
  );
  expect(container.textContent).toContain("2 payments");
  const rows = [...container.querySelectorAll("tbody tr")];
  expect(rows).toHaveLength(2);
  expect(rows[0].textContent).toContain("INV-204");
  expect(rows[0].textContent).toContain("$11,700.00");
  expect(rows[1].textContent).toContain("$3,600.00");
  await click(button("Hide settled"));
  expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
});
