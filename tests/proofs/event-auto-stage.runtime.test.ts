/**
 * Runtime proof (site comment #421): an event moves through its stages by
 * itself when each stage's conditions are met, and the company decides which
 * stages stay a person's step. Default: the sales lock waits for a person.
 * With nothing by hand, the event walks to Sales lock as soon as its facts
 * are there, then to Executing at the crew's start, Final at the end, and
 * Completed when the crew is back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ENDS_AT,
  SERVE_AT,
  settle,
  stubTimingEnv,
  timingWorld,
} from "./timing-rules.runtime.helpers";

beforeEach(() => {
  stubTimingEnv();
  vi.useFakeTimers();
  // Test timers cannot wait past ~24 days; start two days before the event.
  vi.setSystemTime(SERVE_AT - 2 * 24 * 3_600_000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const M = api.mutations;

async function readyWorld() {
  const world = await timingWorld({ policy: null });
  const { t, owner, event, plannerId } = world;
  await settle(t);
  const stage = async () =>
    (await t.run((ctx) => ctx.db.get(event)))?.stage as string;
  // Only the plan so far: the setup list is not done, so it stays put.
  expect(await stage()).toBe("planning");

  const dish = (await owner.mutation(M.Dish_createViaIntroduce, {
    name: "Auto stage plate",
    portionSize: 1,
    portionUnit: "portion",
  })) as { docId: Id<"dishes"> };
  await owner.mutation(M.EventDish_createViaAddToEvent, {
    eventId: event,
    dishId: dish.docId,
    quantityServings: 120,
    course: "main",
  });
  await settle(t);
  expect(await stage()).toBe("planning");
  await owner.mutation(M.EventAssignment_createViaAssign, {
    eventId: event,
    personId: plannerId,
    role: "Lead",
  });
  await settle(t);
  return { ...world, stage };
}

describe("automatic event stage moves (#421)", () => {
  it("moves on by itself once the setup list is done, and waits at the sales lock for a person by default", async () => {
    const { t, stage, event } = await readyWorld();
    expect(await stage()).toBe("approved");
    const saved = await t.run((ctx) => ctx.db.get(event));
    expect(saved?.approvedAt).toEqual(expect.any(Number));
    // The clock never takes it past a by-hand step.
    await settle(t);
    expect(await stage()).toBe("approved");
  });

  it("with nothing by hand, walks to Sales lock at once and through Executing, Final and Completed at the event's own times", async () => {
    const { t, owner, organization, stage, event } = await readyWorld();
    await owner.mutation(M.Organization_configureStageMoves, {
      docId: organization,
      byHandJson: "[]",
    });
    await settle(t);
    expect(await stage()).toBe("completed");
    const saved = await t.run((ctx) => ctx.db.get(event));
    expect(saved?.salesLockedAt).toBeLessThan(SERVE_AT);
    // No timing plan here: Executing at the event start, Final and Completed
    // at its end.
    expect(saved?.executionStartedAt).toBeGreaterThanOrEqual(SERVE_AT);
    expect(saved?.finalizedAt).toBeGreaterThanOrEqual(ENDS_AT);
    expect(saved?.completedAt).toBeGreaterThanOrEqual(ENDS_AT);
  });

  it("a stage the company keeps by hand stops the walk there", async () => {
    const { t, owner, organization, stage } = await readyWorld();
    await owner.mutation(M.Organization_configureStageMoves, {
      docId: organization,
      byHandJson: JSON.stringify(["executing"]),
    });
    await settle(t);
    expect(await stage()).toBe("sales_lock");
  });
});
