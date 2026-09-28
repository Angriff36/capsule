/**
 * AC-488 (PL-PREP, spec BE-11.2): a "must follow" loop fails only the tasks in
 * that loop, with a message that names them. Work outside the loop keeps its
 * normal state, and dropping one link frees the loop.
 */
import { describe, expect, it } from "vitest";
import {
  prepTaskDependencyLabel,
  prepTaskDependencyLoop,
  prepTaskDependencyLoopLinks,
  prepTaskDependencySummary,
  type PrepTaskDependencyLink,
} from "../../../src/features/production/PrepTaskDependencies";

const tasks = [
  { _id: "sauce", name: "Make sauce", status: "pending" },
  { _id: "stock", name: "Make stock", status: "pending" },
  { _id: "roux", name: "Make roux", status: "pending" },
  { _id: "plate", name: "Plate chicken", status: "pending" },
  { _id: "chop", name: "Chop herbs", status: "completed" },
  { _id: "garnish", name: "Garnish", status: "pending" },
];

// sauce -> stock -> roux -> sauce is a loop; plate waits on sauce (outside the
// loop); garnish waits on finished chopping.
const links: (PrepTaskDependencyLink & { _id: string })[] = [
  { _id: "l1", dependentTaskId: "sauce", predecessorTaskId: "stock" },
  { _id: "l2", dependentTaskId: "stock", predecessorTaskId: "roux" },
  { _id: "l3", dependentTaskId: "roux", predecessorTaskId: "sauce" },
  { _id: "l4", dependentTaskId: "plate", predecessorTaskId: "sauce" },
  { _id: "l5", dependentTaskId: "garnish", predecessorTaskId: "chop" },
];

const summary = (id: string, rows = links) =>
  prepTaskDependencySummary(id, tasks, rows);

describe("prep dependency loops (AC-488)", () => {
  it("an existing loop fails only that chain with a message naming its tasks", () => {
    expect(prepTaskDependencyLoop("sauce", links)).toEqual([
      "roux",
      "sauce",
      "stock",
    ]);
    const sauce = summary("sauce");
    expect(sauce.isBlocked).toBe(true);
    expect([...sauce.loopNames].sort()).toEqual(["Make roux", "Make stock"]);
    expect(prepTaskDependencyLabel(sauce)).toBe(
      'Stuck in a loop: this task and Make roux, Make stock each wait on the other. Remove one "must follow" link on the prep board.',
    );
    for (const id of ["stock", "roux"])
      expect(summary(id).loopNames).toHaveLength(2);

    // Outside the loop: plate simply waits on the sauce; garnish is free.
    expect(prepTaskDependencyLoop("plate", links)).toEqual([]);
    expect(summary("plate")).toMatchObject({
      isBlocked: true,
      loopNames: [],
      blockerNames: ["Make sauce"],
    });
    expect(summary("garnish")).toMatchObject({
      isBlocked: false,
      loopNames: [],
    });
    expect(summary("chop").total).toBe(0);
  });

  it("offers each loop task its own link into the loop, and dropping one frees the loop", () => {
    expect(
      prepTaskDependencyLoopLinks("sauce", links).map((l) => l._id),
    ).toEqual(["l1"]);
    expect(prepTaskDependencyLoopLinks("plate", links)).toEqual([]);

    const dropped = links.map((link) =>
      link._id === "l3" ? { ...link, requirementReleasedAt: 1 } : link,
    );
    for (const id of ["sauce", "stock", "roux"]) {
      expect(prepTaskDependencyLoop(id, dropped)).toEqual([]);
      expect(summary(id, dropped).loopNames).toEqual([]);
    }
    // Roux no longer waits on anything; the rest wait in order.
    expect(summary("roux", dropped)).toMatchObject({
      total: 0,
      isBlocked: false,
    });
    expect(summary("stock", dropped).blockerNames).toEqual(["Make roux"]);
  });

  it("a two-task loop names the other task", () => {
    const pair = [
      { dependentTaskId: "sauce", predecessorTaskId: "stock" },
      { dependentTaskId: "stock", predecessorTaskId: "sauce" },
    ];
    expect(summary("sauce", pair as typeof links).loopNames).toEqual([
      "Make stock",
    ]);
  });
});
