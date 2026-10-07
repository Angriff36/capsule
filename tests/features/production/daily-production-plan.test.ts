// @vitest-environment jsdom
/**
 * AC-455 (PL-PRODUCTION-PLAN, spec BE-9.6): the production plan groups the
 * same Event prep tasks and batches by production day, station, recipe and
 * batch, with dependencies and an explicit make-ahead window when one is set.
 * Pooled work keeps each Event's own share and the real output.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildProductionPlan,
  NO_STATION,
  planDayKey,
  type PlanPrepTask,
  type ProductionPlanInput,
} from "../../../convex/lib/culinaryModel/productionPlan";
import {
  makeAheadLabel,
  ProductionPlanView,
} from "../../../src/features/production/ProductionPlanPage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const at = (day: number) => new Date(2026, 10, day, 12).getTime();
const SAT = at(14);
const SUN = at(15);

const task = (
  over: Pick<PlanPrepTask, "_id" | "eventId" | "name"> & Partial<PlanPrepTask>,
): PlanPrepTask => ({
  quantity: 40,
  unit: "portion",
  status: "pending",
  deletedAt: null,
  dueAt: null,
  ...over,
});

const input: ProductionPlanInput = {
  events: [
    { _id: "gala", title: "Harbor gala", startsAt: SAT },
    { _id: "wedding", title: "Lee wedding", startsAt: SUN },
    { _id: "gone", title: "Deleted event", startsAt: SAT, deletedAt: 1 },
  ],
  dishTasks: [
    {
      _id: "step-braise",
      name: "Braise short rib",
      leadTimeMinDays: 1,
      leadTimeMaxDays: 2,
    },
    {
      _id: "step-slice",
      name: "Slice short rib",
      sequenceAfterDishTaskId: "step-braise",
    },
    { _id: "step-dress", name: "Dress salad" },
  ],
  prepTasks: [
    // Same step, both events: due the same day, so one pooled row.
    task({
      _id: "g-braise",
      eventId: "gala",
      name: "Braise short rib",
      dishTaskId: "step-braise",
      componentId: "rib",
      stationId: "hot",
      dueAt: at(12),
    }),
    task({
      _id: "w-braise",
      eventId: "wedding",
      name: "Braise short rib",
      dishTaskId: "step-braise",
      componentId: "rib",
      stationId: "hot",
      dueAt: at(12),
      quantity: 60,
      status: "completed",
      completedQuantity: 58,
    }),
    // No due time: day = latest make-ahead day; no window = event day.
    task({
      _id: "g-slice",
      eventId: "gala",
      name: "Slice short rib",
      dishTaskId: "step-slice",
      stationId: "hot",
    }),
    task({
      _id: "g-dress",
      eventId: "gala",
      name: "Dress salad",
      dishTaskId: "step-dress",
      station: "Garde manger",
    }),
    task({ _id: "g-plate", eventId: "gala", name: "Plate canapes" }),
    task({
      _id: "x-gone",
      eventId: "gone",
      name: "Dress salad",
      dishTaskId: "step-dress",
      station: "Garde manger",
    }),
    task({
      _id: "g-cancel",
      eventId: "gala",
      name: "Dress salad",
      dishTaskId: "step-dress",
      station: "Garde manger",
      status: "cancelled",
    }),
  ],
  batches: [
    {
      _id: "b-jus",
      componentId: "jus",
      plannedYield: 12,
      actualYield: 11,
      surplusQuantity: 2,
      yieldUnit: "quart",
      status: "completed",
      productionDate: at(13),
    },
  ],
  allocations: [
    {
      _id: "a-gala",
      productionBatchId: "b-jus",
      eventId: "gala",
      allocatedQuantity: 4,
    },
    {
      _id: "a-wed",
      productionBatchId: "b-jus",
      eventId: "wedding",
      allocatedQuantity: 6,
    },
    {
      _id: "a-extra",
      productionBatchId: "b-jus",
      allocatedQuantity: 2,
      isSurplus: true,
    },
  ],
  dependencies: [{ dependentTaskId: "g-dress", predecessorTaskId: "g-plate" }],
  stations: [
    { _id: "hot", name: "Hot line", sortOrder: 1 },
    { _id: "cold", name: "Garde manger", sortOrder: 2 },
  ],
  components: [
    { _id: "rib", name: "Short rib" },
    { _id: "jus", name: "Red wine jus" },
  ],
};

describe("daily production plan (AC-455)", () => {
  it("the production plan groups work by production day across events with station, batch and dependency rows and an explicit make-ahead window when set", () => {
    const plan = buildProductionPlan(input);
    expect(plan.map((day) => day.day)).toEqual([
      planDayKey(at(12)),
      planDayKey(at(13)),
      planDayKey(SAT),
    ]);

    // Day 1: both events' braise pooled on the hot line, each share kept.
    const [braise] = plan[0]!.stations[0]!.rows;
    expect(plan[0]!.stations[0]!.station).toBe("Hot line");
    expect(braise).toMatchObject({
      kind: "prep",
      recipe: "Short rib",
      step: "Braise short rib",
      planned: 100,
      made: 58,
      done: false,
    });
    expect(
      braise!.shares.map((s) => [s.eventTitle, s.sourceId, s.quantity, s.made]),
    ).toEqual([
      ["Harbor gala", "g-braise", 40, 0],
      ["Lee wedding", "w-braise", 60, 58],
    ]);
    // Make-ahead window comes from the recipe step: 1-2 days before each event.
    expect(braise!.makeAhead).toMatchObject({ minDays: 1, maxDays: 2 });

    // Day 2: the jus batch with its event shares, real output and surplus.
    const batchRow = plan[1]!.stations[0]!.rows[0]!;
    expect(batchRow).toMatchObject({
      kind: "batch",
      batchId: "b-jus",
      recipe: "Red wine jus",
      station: NO_STATION,
      planned: 12,
      made: 11,
      surplus: 2,
      done: true,
    });
    expect(
      batchRow.shares.map((s) => [s.eventId, s.sourceId, s.quantity]),
    ).toEqual([
      ["gala", "a-gala", 4],
      ["wedding", "a-wed", 6],
    ]);

    // Event day: slicing waits for braising; salad waits for the linked task.
    const eventDay = plan[2]!;
    expect(eventDay.stations.map((group) => group.station)).toEqual([
      "Hot line",
      "Garde manger",
      NO_STATION,
    ]);
    const slice = eventDay.stations[0]!.rows[0]!;
    expect(slice.step).toBe("Slice short rib");
    expect(slice.makeAhead).toBeNull();
    expect(slice.waitsFor).toEqual([
      { label: "Braise short rib", done: false },
    ]);
    const dress = eventDay.stations[1]!.rows[0]!;
    expect(dress.shares.map((s) => s.sourceId)).toEqual(["g-dress"]);
    expect(dress.waitsFor).toEqual([{ label: "Plate canapes", done: false }]);
  });

  it("a step with no due time is planned on the last day of its make-ahead window", () => {
    const plan = buildProductionPlan({
      ...input,
      prepTasks: [
        task({
          _id: "only",
          eventId: "wedding",
          name: "Braise short rib",
          dishTaskId: "step-braise",
        }),
      ],
      batches: [],
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]!.day).toBe(planDayKey(at(14)));
    expect(plan[0]!.stations[0]!.rows[0]!.makeAhead).toMatchObject({
      earliestDay: planDayKey(at(13)),
      latestDay: planDayKey(at(14)),
    });
  });

  describe("screen", () => {
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

    it("shows each day, the events in a pooled row, the make-ahead window and what a row waits for", async () => {
      const days = buildProductionPlan(input);
      await act(async () =>
        root.render(
          createElement(
            MemoryRouter,
            {},
            createElement(ProductionPlanView, {
              days,
              today: planDayKey(at(1)),
            }),
          ),
        ),
      );
      expect(
        container.querySelectorAll('[data-testid="production-plan-day"]'),
      ).toHaveLength(3);
      const rows = Array.from(
        container.querySelectorAll('[data-testid="production-plan-row"]'),
      );
      const braise = rows.find((row) =>
        row.textContent?.includes("Braise short rib"),
      )!;
      expect(braise.textContent).toContain("Harbor gala 40 portions");
      expect(braise.textContent).toContain("Lee wedding 60 portions · done");
      expect(braise.textContent).toMatch(/Make 1–2 days ahead/);
      const slice = rows.find((row) =>
        row.textContent?.includes("Slice short rib"),
      )!;
      expect(slice.textContent).toContain("Not set");
      expect(slice.textContent).toContain("Braise short rib");
      expect(makeAheadLabel(null)).toBe("Not set");
    });

    it("hides earlier days until asked", async () => {
      const days = buildProductionPlan(input);
      await act(async () =>
        root.render(
          createElement(
            MemoryRouter,
            {},
            createElement(ProductionPlanView, { days, today: planDayKey(SAT) }),
          ),
        ),
      );
      expect(
        container.querySelectorAll('[data-testid="production-plan-day"]'),
      ).toHaveLength(1);
      expect(container.textContent).toContain("Show 2 earlier days");
    });
  });
});
