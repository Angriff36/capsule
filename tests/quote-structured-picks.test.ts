// @vitest-environment jsdom
// AC-095 / AC-243 / AC-246 form leg: on the public quote form a visitor
// picks a menu, unticks a dish, sets portions, adds an extra from another
// menu, says how they heard and opts in to offers — and one submit sends all
// of it, structured, with one key for the visit. The estimate box is always
// called an estimate.
import { createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  change,
  click,
  command,
  container,
  field,
  input,
  mount,
  submit,
} from "./support/mounted-app";
import { QuoteSubmissionPage } from "../src/features/sales/QuoteSubmissionPage";

const dish = (menuDishId: string, name: string, price: number) => ({
  menuDishId,
  name,
  description: null,
  course: null,
  serviceStyle: null,
  dietaryTags: [],
  allergens: [],
  price,
});

const menu = (menuId: string, name: string, dishes: unknown[]) => ({
  menuId,
  name,
  description: null,
  category: null,
  price: { kind: "on_request" },
  minGuests: 0,
  maxGuests: 0,
  availableFrom: null,
  availableUntil: null,
  notAvailableBecause: [],
  dishes,
});

function pickRow(menuDishId: string) {
  const box = container.querySelector<HTMLInputElement>(`#pick-${menuDishId}`);
  expect(box, `Missing pick ${menuDishId}`).not.toBeNull();
  return box!;
}

it("sends menu picks, portions, extras, how they heard and opt-in in one submit", async () => {
  backend.values.set("quoteBuilder:getQuoteFormOptions", {
    serviceStyles: [],
    occasions: [],
    referralSources: [{ _id: "rs-show", name: "Wedding show" }],
  });
  backend.values.set("publicMenu:getPublicMenu", [
    menu("menu-garden", "Garden party", [
      dish("md-chicken", "Herb chicken", 18.5),
      dish("md-salad", "Summer salad", 6),
      dish("md-tart", "Lemon tart", 4),
    ]),
    menu("menu-late", "Late night", [dish("md-slider", "Slider bar", 7.25)]),
  ]);
  backend.values.set("lib/quoteSelections:estimateQuote", {
    ok: true,
    estimate: {
      label: "Estimate",
      guestCount: 60,
      lines: [{ description: "Herb chicken", amount: 1110 }],
      menuSubtotal: 1110,
      extras: [],
      extrasTotal: 0,
      total: 1110,
      priceToFollow: [],
      assumptions: ["Based on 60 guests."],
    },
  });
  const send = command("quoteBuilder:submitQuote", {
    submissionId: "quote-1",
    message: "Request received",
  });

  await mount(createElement(QuoteSubmissionPage));
  input("clientName", "Robin Prospect");
  input("email", "robin@example.com");
  input("eventDate", "2099-11-07");
  input("guestCount", "60");
  change(field("menuId") as HTMLSelectElement, "menu-garden");

  // Dishes of the chosen menu start ticked; untick the salad.
  expect(pickRow("md-chicken").checked).toBe(true);
  await click(pickRow("md-salad"));
  expect(pickRow("md-salad").checked).toBe(false);
  const tartPortions = pickRow("md-tart")
    .closest("li")!
    .querySelector<HTMLInputElement>('input[type="number"]')!;
  change(tartPortions, "20");

  // An extra from the other menu.
  await click(pickRow("extra-md-slider"));
  const sliderPortions = pickRow("extra-md-slider")
    .closest("li")!
    .querySelector<HTMLInputElement>('input[type="number"]')!;
  change(sliderPortions, "40");

  expect(container.textContent).toContain("Estimate — not a final price");
  expect(container.textContent).toContain("Based on 60 guests.");

  change(field("referralSourceId") as HTMLSelectElement, "rs-show");
  (field("consent") as HTMLInputElement).checked = true;
  (field("marketingConsent") as HTMLInputElement).checked = true;
  await submit(field("clientName").closest("form")!);

  expect(send).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      guestCount: 60,
      consent: true,
      menuId: "menu-garden",
      picks: [
        { menuDishId: "md-chicken" },
        { menuDishId: "md-tart", quantity: 20 },
      ],
      extras: [{ menuDishId: "md-slider", quantity: 40 }],
      referralSourceId: "rs-show",
      marketingConsent: true,
      submissionKey: expect.any(String),
      landingPage: "/",
    }),
  );
  expect(container.textContent).toContain("Request received");
});
