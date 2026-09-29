// @vitest-environment jsdom
// PL-ASSET-AVAILABILITY (AC-133 PR10-03): under the equipment picker the
// office sees how many are free for this event, which events hold the rest
// and when, where it is kept, its condition, and - when short or out of
// service - the ways out: another item of the same kind, move one, or rent.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEquipmentAvailabilityNote } from "../../../src/features/events/EventEquipmentAvailabilityNote";
import {
  replacementsFor,
  type ItemAvailability,
} from "../../../src/features/events/equipmentAvailabilityView";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const item = (over: Partial<ItemAvailability>): ItemAvailability => ({
  equipmentId: "warmer-1",
  name: "Hot box warmer",
  category: "Warmers",
  condition: "good",
  location: "Main kitchen",
  quantity: 2,
  free: 2,
  blocked: null,
  conflicts: [],
  ...over,
});

const short = item({
  free: 0,
  conflicts: [
    {
      eventId: "e1",
      eventTitle: "Smith wedding",
      startsAt: Date.UTC(2026, 10, 7, 15),
      endsAt: Date.UTC(2026, 10, 7, 23),
      quantity: 2,
      overdue: false,
    },
  ],
});
const spare = item({
  equipmentId: "warmer-2",
  name: "Cambro carrier",
  quantity: 4,
  free: 3,
  location: "Second kitchen",
});
const broken = item({
  equipmentId: "warmer-3",
  name: "Old warmer",
  blocked: "out_of_service",
  free: 5,
});
const otherKind = item({
  equipmentId: "linen-1",
  name: "Linen",
  category: "Linens",
  free: 50,
});

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

function render(props: Parameters<typeof EventEquipmentAvailabilityNote>[0]) {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        null,
        createElement(EventEquipmentAvailabilityNote, props),
      ),
    );
  });
  return container.textContent ?? "";
}

describe("equipment availability note", () => {
  it("offers only bookable items of the same kind with enough free", () => {
    const all = [short, spare, broken, otherKind];
    expect(
      replacementsFor(short, all, 2).map((row) => row.equipmentId),
    ).toEqual(["warmer-2"]);
    expect(replacementsFor(short, all, 4)).toEqual([]);
  });

  it("names the holding event and the ways out when the item is short", () => {
    const onPick = vi.fn();
    const text = render({
      item: short,
      all: [short, spare, broken, otherKind],
      wanted: 1,
      onPick,
    });
    expect(text).toContain(
      "0 of 2 free for this time · kept at Main kitchen · condition good",
    );
    expect(text).toContain("Smith wedding · 2 held");
    expect(text).toContain("Not enough for this event. You can:");
    expect(text).toContain(
      "Use Cambro carrier instead (3 free, at Second kitchen)",
    );
    expect(text).not.toContain("Old warmer");
    expect(text).toContain("Move one from another place on the equipment list");
    expect(text).toContain("Rent it in “Rented from vendors” below");
    const button = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Cambro carrier"),
    )!;
    act(() => button.click());
    expect(onPick).toHaveBeenCalledWith("warmer-2");
  });

  it("says out of service plainly and stays quiet when there is enough", () => {
    expect(
      render({ item: broken, all: [broken], wanted: 1, onPick: vi.fn() }),
    ).toContain(
      "Out of service - it can't be booked until it is marked fixed.",
    );
    const text = render({
      item: spare,
      all: [spare],
      wanted: 2,
      onPick: vi.fn(),
    });
    expect(text).toContain("3 of 4 free for this time");
    expect(text).not.toContain("Not enough");
  });
});
