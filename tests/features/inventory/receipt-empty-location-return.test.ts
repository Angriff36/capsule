// @vitest-environment jsdom
/**
 * AC-083 (PR04-09): receiving or ordering with no location or vendor lets the
 * person add one in place and keeps everything already typed in the form.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NEW_LOCATION_FIELD,
  ReceiptLocationField,
} from "../../../src/features/inventory/ReceiptLocationField";
import {
  NEW_VENDOR_FIELD,
  PurchasingCommandForm,
} from "../../../src/features/inventory/PurchasingCommandForm";
import {
  ADD_NEW_CHOICE,
  findByName,
} from "../../../src/features/inventory/inlineCatalogChoice";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function setValue(field: HTMLInputElement | HTMLSelectElement, value: string) {
  act(() => {
    const proto = Object.getPrototypeOf(field) as object;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const walkIn = { _id: "loc-1", name: "Walk-in cooler", status: "active" };

function ReceiptForm({
  locations,
}: {
  locations: (typeof walkIn)[] | undefined;
}) {
  return createElement(
    "form",
    null,
    createElement("input", { name: "quantity", defaultValue: "" }),
    createElement(ReceiptLocationField, { locations }),
    createElement("input", { name: "supplierLotNumber", defaultValue: "" }),
  );
}

describe("receiving with no locations offers inline creation and returns to the preserved receipt form", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const field = <T extends Element>(selector: string) => {
    const found = container.querySelector<T>(selector);
    if (!found) throw new Error(`missing ${selector}`);
    return found;
  };

  it("with no locations the field is a name box, and the typed receipt survives the new location arriving", () => {
    act(() => root.render(createElement(ReceiptForm, { locations: [] })));
    setValue(field<HTMLInputElement>('[name="quantity"]'), "12");
    setValue(field<HTMLInputElement>('[name="supplierLotNumber"]'), "LOT-9");
    const nameBox = field<HTMLInputElement>(`[name="${NEW_LOCATION_FIELD}"]`);
    setValue(nameBox, "Walk-in cooler");
    expect(container.textContent).toContain("No storage locations yet");
    expect(container.querySelector("a")).toBeNull();

    // The receipt created the location; the list now has it.
    act(() => root.render(createElement(ReceiptForm, { locations: [walkIn] })));
    expect(field<HTMLInputElement>('[name="quantity"]').value).toBe("12");
    expect(field<HTMLInputElement>('[name="supplierLotNumber"]').value).toBe(
      "LOT-9",
    );
    expect(field<HTMLSelectElement>('[name="locationId"]').value).toBe("loc-1");
  });

  it("with locations, New location swaps in a name box in place and Pick an existing location goes back", () => {
    act(() => root.render(createElement(ReceiptForm, { locations: [walkIn] })));
    setValue(field<HTMLInputElement>('[name="quantity"]'), "4");
    setValue(field<HTMLSelectElement>('[name="locationId"]'), ADD_NEW_CHOICE);
    expect(container.querySelector('[name="locationId"]')).toBeNull();
    setValue(
      field<HTMLInputElement>(`[name="${NEW_LOCATION_FIELD}"]`),
      "Dry store",
    );
    expect(field<HTMLInputElement>('[name="quantity"]').value).toBe("4");

    const back = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Pick an existing location",
    );
    act(() => back?.click());
    expect(field<HTMLSelectElement>('[name="locationId"]')).toBeTruthy();
    expect(field<HTMLInputElement>('[name="quantity"]').value).toBe("4");
  });

  it("a retried name reuses the location or vendor the first try made", () => {
    expect(findByName([walkIn], "  walk-in COOLER ")).toBe(walkIn);
    expect(findByName([walkIn], "Dry store")).toBeUndefined();
    expect(findByName([walkIn], "   ")).toBeUndefined();
  });
});

describe("opening an order with no vendors adds one inline and keeps the order form", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderOrder = (
    activeVendors: { _id: string; name: string; status: string }[],
    onSubmit = vi.fn(),
  ) =>
    act(() =>
      root.render(
        createElement(PurchasingCommandForm, {
          form: "order",
          busy: false,
          activeVendors,
          events: [],
          onCancel: () => {},
          onSubmit,
        }),
      ),
    );

  it("no vendors: the vendor is a name box and the submitted form carries it with the notes", () => {
    const onSubmit = vi.fn((event: Event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      expect(data.get(NEW_VENDOR_FIELD)).toBe("Sysco");
      expect(data.get("notes")).toBe("Friday drop");
    });
    renderOrder([], onSubmit);
    expect(container.textContent).toContain("No vendors yet");
    setValue(
      container.querySelector<HTMLInputElement>(
        `[name="${NEW_VENDOR_FIELD}"]`,
      )!,
      "Sysco",
    );
    const notes =
      container.querySelector<HTMLTextAreaElement>('[name="notes"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set?.call(notes, "Friday drop");
      notes.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("with vendors, New vendor swaps in a name box without clearing the order number", () => {
    renderOrder([{ _id: "v1", name: "Restaurant Depot", status: "active" }]);
    const orderNumber = container.querySelector<HTMLInputElement>(
      '[name="orderNumber"]',
    )!;
    setValue(orderNumber, "PO-77");
    setValue(
      container.querySelector<HTMLSelectElement>('[name="vendorId"]')!,
      ADD_NEW_CHOICE,
    );
    expect(
      container.querySelector(`[name="${NEW_VENDOR_FIELD}"]`),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLInputElement>('[name="orderNumber"]')!.value,
    ).toBe("PO-77");
  });
});
