// @vitest-environment jsdom
import { ConvexError } from "convex/values";
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
import { EventEquipmentPanel } from "../../../src/features/events/EventEquipmentPanel";
import type { Id } from "../../../src/lib/api";

const EVENT = "event-a" as Id<"events">;
const REFUSAL =
  "Hot box warmer has 0 free for that time and you asked for 1. Already booked: Smith wedding, Nov 7, 1 held. Kept at Main kitchen cage. Pick other equipment, move one from another place, rent it from a vendor, or ask a manager to book over it with a reason.";

it("a refused reservation says why and what to do next, and the form stays filled (AC-049, #144)", async () => {
  backend.values.set("useListEquipment", [
    {
      _id: "equip-warmer",
      name: "Hot box warmer",
      assetTag: "HB-1",
      status: "active",
      quantity: 1,
      condition: "good",
    },
  ]);
  const reserve = command("equipmentCheckout:reserve");
  reserve.mockRejectedValueOnce(new ConvexError(REFUSAL));
  await mount(
    createElement(EventEquipmentPanel, {
      eventId: EVENT,
      startsAt: Date.UTC(2026, 10, 7, 15),
      endsAt: Date.UTC(2026, 10, 7, 23),
    }),
  );

  await click(button("Reserve equipment"));
  const form = container.querySelector("form")!;
  input("equipmentId", "equip-warmer", form);
  input("quantity", "1", form);
  await submit(form);

  expect(reserve).toHaveBeenCalledTimes(1);
  // The banner carries the server's reason and the ways out, not a no-op.
  const text = container.textContent ?? "";
  expect(text).toContain("has 0 free for that time");
  expect(text).toContain("Already booked: Smith wedding");
  expect(text).toMatch(/rent it from a vendor/);
  // Nothing was booked and the form is still open with the choice kept.
  expect(text).not.toContain("Equipment reserved");
  expect(field("equipmentId").value).toBe("equip-warmer");
  expect(button("Reserve item")).toBeTruthy();
});

it("an empty equipment catalog names the way to add kit instead of a dead list (AC-049, #144)", async () => {
  await mount(createElement(EventEquipmentPanel, { eventId: EVENT }));
  await click(button("Reserve equipment"));
  const hint = container.querySelector(
    '[data-testid="equipment-empty-catalog"]',
  )!;
  expect(hint.textContent).toContain("Nothing in the equipment catalog yet");
  const link = hint.querySelector<HTMLAnchorElement>("a")!;
  expect(link.getAttribute("href")).toBe("/facilities/equipment");
  expect(link.target).toBe("_blank");
});
