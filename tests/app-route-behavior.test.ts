// @vitest-environment jsdom
import { act, createElement } from "react";
import { beforeAll, expect, it, vi } from "vitest";
import {
  backend,
  container,
  mount,
  location,
  command,
} from "./support/mounted-app";
// Scoped and paged reads answer from the rows the test gives each table's
// generated list hook.
vi.mock("../src/lib/financeScopedQueries", async () => {
  const { financeScopedMock, fromListHooks } =
    await import("./helpers/financeScopedQueriesMock");
  const { backend } = await import("./support/mounted-app");
  return financeScopedMock(fromListHooks(backend.values));
});
import { App } from "../src/app/App";

// Compile the real chart dependencies before timing route interaction.
beforeAll(async () => {
  await import("../src/features/reports/ReportsPage");
}, 30000);

it.each([
  ["/events", "Events"],
  ["/clients", "Clients"],
  ["/finance/invoices", "Invoices"],
  ["/finance/payments", "Payments"],
  ["/finance/payroll", "Payroll inputs"],
  ["/logistics/pack-templates", "Pack setup"],
  ["/reports", "Reports"],
  ["/inventory/stock", "Stock"],
  ["/inventory/purchasing", "Weekly purchasing drafts"],
  ["/kitchen/components", "Recipes"],
  ["/kitchen/ingredients", "Ingredients"],
  ["/kitchen/dishes", "Dishes"],
  ["/kitchen/menus", "Menus"],
  ["/kitchen/components/import", "Import recipe"],
])(
  "opens %s through the real authentication gate and shell",
  async (path, heading) => {
    await mount(createElement(App), path);
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    await vi.waitFor(
      async () => {
        await act(async () => {});
        expect(container.querySelector("main h1")?.textContent?.trim()).toBe(
          heading,
        );
      },
      { timeout: 5000 },
    );
    expect(location).toBe(path);
    expect(container.querySelector('a[href="/events"]')).not.toBeNull();
  },
);

// Pack lists, deliveries, contracts and closeouts live on their event (owner,
// 2026-10-14); the old list pages send people to the board or the events.
it.each([
  ["/logistics/pack-lists", "/logistics/dispatch"],
  ["/logistics/packlists", "/logistics/dispatch"],
  ["/logistics/packs", "/logistics/dispatch"],
  ["/logistics/deliveries", "/logistics/dispatch"],
  ["/clients/contracts", "/events"],
  ["/finance/closeout", "/events"],
])("sends the old %s list to %s", async (path, target) => {
  await mount(createElement(App), path);
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(location).toBe(target);
  });
});

it("opens an old pack list link on its event's Equipment tab", async () => {
  const eventId = "kd7ez3fz56ya246m6p17az2ad58crnwh";
  backend.values.set("useGetPackList", {
    _id: recordId,
    version: 1,
    eventId,
    name: "Harborview service pack",
    status: "draft",
  });
  await mount(createElement(App), `/logistics/packs/${recordId}`);
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(location).toBe(`/events/${eventId}?tab=equipment`);
  });
});

const recordId = "nn7ez3fz56ya246m6p17az2ad58crnwg";
it.each([
  [
    "/clients",
    "useGetClient",
    "Harborview",
    { clientType: "company", companyName: "Harborview", status: "active" },
  ],
  [
    "/inventory/orders",
    "useGetVendorOrder",
    "PO-204",
    { orderNumber: "PO-204", status: "received", totalAmount: 120 },
  ],
  [
    "/kitchen/ingredients",
    "useGetIngredient",
    "Carrots",
    { name: "Carrots", status: "active", unit: "pound" },
  ],
  [
    "/kitchen/components",
    "useGetComponent",
    "Carrot puree",
    {
      name: "Carrot puree",
      status: "draft",
      yieldQuantity: 4,
      yieldUnit: "pound",
    },
  ],
  [
    "/kitchen/dishes",
    "useGetDish",
    "Roast carrots",
    { name: "Roast carrots", status: "draft" },
  ],
  [
    "/kitchen/menus",
    "useGetMenu",
    "Spring supper",
    { name: "Spring supper", status: "draft" },
  ],
  [
    "/finance/invoices",
    "useGetInvoice",
    "INV-204",
    { invoiceNumber: "INV-204", status: "draft", amountDue: 900, total: 900 },
  ],
])(
  "opens the actual %s record through App",
  async (prefix, hook, heading, record) => {
    backend.values.set("brandLogo:getBrandLogoUrl", null);
    command("invoiceReminders:getSchedule", null);
    command("invoicePayments:getPaymentLink", null);
    backend.values.set(hook, { _id: recordId, version: 1, ...record });
    await mount(createElement(App), `${prefix}/${recordId}`);
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(container.querySelector("main h1")?.textContent?.trim()).toBe(
      heading,
    );
    expect(location).toBe(`${prefix}/${recordId}`);
    expect(backend.reads).toHaveBeenCalledWith(hook, recordId);
  },
);

it("redirects an old event-menu bookmark to that event's working menu tab", async () => {
  backend.values.set("useGetEvent", {
    _id: recordId,
    title: "Garden dinner",
    stage: "planning",
    eventType: "dinner",
    startsAt: Date.UTC(2099, 6, 4, 17),
    endsAt: Date.UTC(2099, 6, 4, 22),
    expectedHeadcount: 40,
    version: 3,
  });
  await mount(createElement(App), `/events/${recordId}/menu`);
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  expect(location).toBe(`/events/${recordId}?tab=menu`);
  expect(container.textContent).toContain("Garden dinner");
  expect(container.textContent).toContain("Add dish");
});
it("redirects the retired kitchen event-menu destination to the working event list", async () => {
  await mount(createElement(App), "/kitchen/event-menu");
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  expect(location).toBe("/events");
  expect(container.querySelector("main h1")?.textContent).toBe("Events");
});
