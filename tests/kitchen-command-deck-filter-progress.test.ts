import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KitchenCommandDeckHorizon } from "../src/features/kitchen/command-deck/KitchenCommandDeckHorizon";
import {
  KitchenCommandDeckModel,
  commandDeckFilterNoun,
} from "../src/features/kitchen/command-deck/KitchenCommandDeckModel";
import type {
  DishLike,
  EventDishLike,
  EventLike,
  PersonLike,
  PrepTaskLike,
} from "../src/features/kitchen/command-deck/KitchenCommandDeckTypes";

function modelWithAssignedSteps() {
  const now = Date.now();
  const event: EventLike = {
    _id: "evt1",
    title: "QA Gallery Opening Reception",
    startsAt: now,
  };
  const dish: DishLike = { _id: "dish1", name: "Corn" };
  const selection: EventDishLike = {
    _id: "sel1",
    eventId: "evt1",
    dishId: "dish1",
    quantityServings: 60,
  };
  const person: PersonLike = {
    _id: "p1",
    givenName: "Josh",
    familyName: "Mitchell",
  };
  const tasks: PrepTaskLike[] = Array.from({ length: 15 }, (_, i) => ({
    _id: `t${i}`,
    version: 1,
    eventId: "evt1",
    eventDishId: "sel1",
    name: `Step ${i + 1}`,
    status: "completed",
    quantity: 1,
    unit: "each",
    assignedToId: "p1",
  }));
  return new KitchenCommandDeckModel(
    [event],
    [selection],
    [dish],
    tasks,
    [person],
    new KitchenCommandDeckHorizon(7, 0),
  );
}

describe("Kitchen Unassigned/Blocked filters count matching of total", () => {
  it("does not keep painting 15/15 · 100% under Unassigned when every step is assigned", () => {
    const model = modelWithAssignedSteps();
    expect(model.progress("evt1")).toEqual({
      total: 15,
      completed: 15,
      pct: 100,
    });
    expect(model.filteredHeadline("evt1", "all", "")).toBe(
      "15/15 steps · 100% complete",
    );
    expect(model.filteredHeadline("evt1", "unassigned", "")).toBe(
      "0 matching Unassigned of 15 steps",
    );
    expect(model.filteredHeadline("evt1", "blocked", "")).toBe(
      "0 matching Blocked of 15 steps",
    );
    expect(model.dishMatchingLine(0, 15, true)).toBe("0 of 15 matching");
    expect(commandDeckFilterNoun("unassigned")).toBe("Unassigned");
  });

  it("TaskPanel headline and dish copy follow the filter, not overall progress", () => {
    const page = readFileSync(
      "src/features/kitchen/command-deck/KitchenCommandDeckTaskPanel.tsx",
      "utf8",
    );
    expect(page).toContain("filteredHeadline");
    expect(page).toContain("of ${allDishTasks.length} matching");
    expect(page).toContain(
      "Select an event from the list to orchestrate prep.",
    );
    expect(page).not.toContain("Select an event on the left");
  });

  it("Quick Assign does not say click Assign when the filter has nothing assignable", () => {
    const rail = readFileSync(
      "src/features/kitchen/command-deck/KitchenCommandDeckCrewRail.tsx",
      "utf8",
    );
    expect(rail).toContain("nothing to assign in this filter.");
    expect(rail).toContain("assignableInView");
  });
});
