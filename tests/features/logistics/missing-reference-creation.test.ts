// @vitest-environment jsdom
import { createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  button,
  click,
  command,
  container,
  field,
  input,
  mount,
  submit,
} from "../../support/mounted-app";
import { EventRentalOrdersPanel } from "../../../src/features/events/EventRentalOrdersPanel";
import type { Id } from "../../../src/lib/api";

const EVENT = "event-a" as Id<"events">;
const VENDOR_CHOICES = "equipmentCheckout:rentalVendorChoices";

async function openRentalForm() {
  await mount(createElement(EventRentalOrdersPanel, { eventId: EVENT }));
  await click(button("Rent from a vendor"));
  return container.querySelector("form")!;
}

it("a missing vendor from the rental form is named in place and the entered values stay (AC-138)", async () => {
  backend.values.set(VENDOR_CHOICES, []);
  const createVendor = command("useCreateVendor", { docId: "vendor-new" });
  const askVendor = command("useCreateRentalOrderLine");
  askVendor.mockRejectedValueOnce(new Error("Vendor is offline"));
  const form = await openRentalForm();

  // No vendors at all: the vendor box is a name box, not a dead select.
  expect(container.textContent).toContain(
    "No vendors yet. Name one here and this rental adds it.",
  );
  // No rental items either: the list offers the equipment list in a new tab.
  const equipmentLink = container.querySelector<HTMLAnchorElement>(
    'a[href="/facilities/equipment"]',
  )!;
  expect(equipmentLink.target).toBe("_blank");

  input("description", "Tent 20x40", form);
  input("quantity", "2", form);
  input("vendorCost", "450", form);
  input("newVendorName", "Party Rentals Co", form);
  await submit(form);
  expect(createVendor).toHaveBeenCalledWith({
    name: "Party Rentals Co",
    paymentTermsDays: 30,
  });
  expect(askVendor).toHaveBeenCalledWith(
    expect.objectContaining({
      eventId: EVENT,
      vendorId: "vendor-new",
      description: "Tent 20x40",
      quantity: 2,
      vendorCost: 450,
    }),
  );
  // The save failed: what the person typed is still there to try again.
  expect((field("description", form) as HTMLInputElement).value).toBe(
    "Tent 20x40",
  );
  expect((field("newVendorName", form) as HTMLInputElement).value).toBe(
    "Party Rentals Co",
  );

  // The retry reuses the vendor the first try made, never a twin.
  backend.values.set(VENDOR_CHOICES, [
    { vendorId: "vendor-new", name: "Party Rentals Co" },
  ]);
  await mount(createElement(EventRentalOrdersPanel, { eventId: EVENT }));
  createVendor.mockClear();
  await submit(container.querySelector("form")!);
  expect(createVendor).not.toHaveBeenCalled();
  expect(askVendor).toHaveBeenLastCalledWith(
    expect.objectContaining({ vendorId: "vendor-new" }),
  );
});

it("an existing vendor list offers New vendor… without losing the form (AC-138)", async () => {
  backend.values.set(VENDOR_CHOICES, [
    { vendorId: "vendor-a", name: "Linen House" },
  ]);
  command("useCreateVendor", { docId: "vendor-b" });
  const askVendor = command("useCreateRentalOrderLine");
  const form = await openRentalForm();
  input("description", "Chairs", form);
  input("vendorId", "__add_new__", form);
  expect(container.textContent).toContain("Name the new vendor.");
  expect((field("description", form) as HTMLInputElement).value).toBe("Chairs");
  input("newVendorName", "Chair Barn", form);
  await submit(form);
  expect(askVendor).toHaveBeenCalledWith(
    expect.objectContaining({ vendorId: "vendor-b", description: "Chairs" }),
  );
});
