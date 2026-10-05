import { describe, expect, it, vi } from "vitest";
import {
  createEventWizardDraft,
  eventWizardCreateErrors,
  eventWizardFingerprint,
  eventWizardStepState,
  validateEventWizardStep,
  type EventWizardDraft,
} from "../src/features/events/eventCreateWizardModel";
import { commitEventWizard } from "../src/features/facilities/useEventWizardCommit";
import { guidedEventCreateAvailable } from "../src/features/events/EventCreatePage";

function draft(): EventWizardDraft {
  return {
    ...createEventWizardDraft("draft-1"),
    clientId: "client-1",
    venueId: "venue-1",
    title: "Autumn dinner",
    eventType: "Dinner",
    startsAt: "2099-11-05T17:00",
    endsAt: "2099-11-05T21:00",
    expectedHeadcount: "40",
    primaryContactName: "Ada Cook",
    dishes: [
      { lineId: "pasta", dishId: "dish-1", dishName: "Pasta" },
      { lineId: "cake", dishId: "dish-2", dishName: "Cake" },
    ],
    staff: [
      { lineId: "chef", personId: "person-1", personName: "Sam", role: "Chef" },
    ],
  };
}
function ports(
  options: {
    event?: "reject" | "unknown";
    dish?: "reject" | "unknown";
    failDish?: string;
  } = {},
) {
  const calls: string[] = [];
  return {
    calls,
    createEvent: vi.fn(async (args: any) => {
      calls.push(`event:${args.idempotencyKey}`);
      if (options.event === "reject") throw new Error("event API unavailable");
      return options.event === "unknown" ? undefined : { docId: "event-1" };
    }),
    createDish: vi.fn(async (args: any) => {
      calls.push(`dish:${args.idempotencyKey}`);
      if (
        options.dish === "reject" ||
        args.idempotencyKey.endsWith(options.failDish ?? ":none")
      )
        throw new Error("dish API unavailable");
      return options.dish === "unknown"
        ? undefined
        : { docId: args.idempotencyKey };
    }),
    createAssignment: vi.fn(async (args: any) => {
      calls.push(`staff:${args.idempotencyKey}`);
      return { docId: args.idempotencyKey };
    }),
    setWorkingEvent: vi.fn((id: string) => calls.push(`working:${id}`)),
  };
}

describe("event creation wizard", () => {
  it("allows empty skipped optional steps but blocks invalid populated optional lines from create", () => {
    const empty = { ...draft(), dishes: [], staff: [] };
    expect(eventWizardCreateErrors(empty)).toEqual([]);
    expect(
      eventWizardCreateErrors({
        ...empty,
        dishes: [
          { lineId: "a", dishId: "d", dishName: "D" },
          { lineId: "b", dishId: "d", dishName: "D" },
        ],
      }),
    ).toContain("Dishes: Add each dish only once.");
    expect(
      eventWizardCreateErrors({
        ...empty,
        staff: [{ lineId: "a", personId: "p", personName: "P", role: "" }],
      }),
    ).toContain("Staff: Each staff assignment needs a person and role.");
  });

  it("marks completed but subsequently invalid work incomplete, without turning skipped work into complete", () => {
    const empty = createEventWizardDraft("draft");
    expect(
      eventWizardStepState("Dishes", { ...empty, skipped: ["Dishes"] }),
    ).toBe("Incomplete");
    expect(
      eventWizardStepState("Dishes", { ...empty, completed: ["Dishes"] }),
    ).toBe("Incomplete");
    const valid = {
      ...empty,
      dishes: [{ lineId: "a", dishId: "dish", dishName: "Dish" }],
      completed: ["Dishes" as const],
    };
    expect(eventWizardStepState("Dishes", valid)).toBe("Complete");
    expect(eventWizardStepState("Dishes", { ...valid, dishes: [] })).toBe(
      "Incomplete",
    );
    expect(eventWizardStepState("Staff", empty)).toBe("Not started");
    expect(validateEventWizardStep("Dishes", empty)).toContain(
      "Add at least one dish, or choose Skip for now.",
    );
  });

  it("records attempted writes before each port call and sets the working event before dish work", async () => {
    const subject = draft(),
      fake = ports(),
      history: EventWizardDraft["commitProgress"][] = [];
    await commitEventWizard(fake, subject, (next) => history.push(next));
    expect(history[0].event).toMatchObject({
      status: "attempted",
      key: "draft-1:event",
    });
    expect(fake.calls).toEqual([
      "event:draft-1:event",
      "working:event-1",
      "dish:draft-1:dish:pasta",
      "dish:draft-1:dish:cake",
      "staff:draft-1:staff:chef",
    ]);
    expect(
      history.some((next) => next.dishes.pasta?.status === "attempted"),
    ).toBe(true);
  });

  it("clears a confirmed rejected event attempt without calling downstream ports", async () => {
    const fake = ports({ event: "reject" }),
      history: EventWizardDraft["commitProgress"][] = [];
    await expect(
      commitEventWizard(fake, draft(), (next) => history.push(next)),
    ).rejects.toThrow("Could not create event");
    expect(fake.calls).toEqual(["event:draft-1:event"]);
    expect(fake.setWorkingEvent).not.toHaveBeenCalled();
    expect(history.at(-1)?.event).toBeUndefined();
  });

  it("keeps an unknown event outcome attempted and retries using exactly the same key", async () => {
    const first = ports({ event: "unknown" }),
      updates: EventWizardDraft["commitProgress"][] = [];
    await expect(
      commitEventWizard(first, draft(), (next) => updates.push(next)),
    ).rejects.toThrow("Could not confirm the event was saved");
    expect(updates.at(-1)?.event).toMatchObject({
      status: "attempted",
      key: "draft-1:event",
    });
    const retry = ports();
    await commitEventWizard(
      retry,
      { ...draft(), commitProgress: updates.at(-1)! },
      vi.fn(),
    );
    expect(retry.calls[0]).toBe("event:draft-1:event");
  });

  it("refuses changed saved lines and a changed unknown event before any write", async () => {
    const first = ports(),
      updates: EventWizardDraft["commitProgress"][] = [];
    await commitEventWizard(first, draft(), (next) => updates.push(next));
    const editedDish = {
      ...draft(),
      dishes: [{ ...draft().dishes[0], dishName: "Changed" }],
      staff: [],
      commitProgress: updates.at(-1)!,
    };
    const noWrites = ports();
    await expect(
      commitEventWizard(noWrites, editedDish, vi.fn()),
    ).rejects.toThrow("Dish 'Changed' may already be saved");
    expect(noWrites.createEvent).not.toHaveBeenCalled();
    expect(noWrites.createDish).not.toHaveBeenCalled();
    expect(noWrites.createAssignment).not.toHaveBeenCalled();
    const unknown = ports({ event: "unknown" }),
      attempted: EventWizardDraft["commitProgress"][] = [];
    await expect(
      commitEventWizard(unknown, draft(), (next) => attempted.push(next)),
    ).rejects.toThrow("Could not confirm");
    await expect(
      commitEventWizard(
        ports(),
        {
          ...draft(),
          expectedHeadcount: "41",
          commitProgress: attempted.at(-1)!,
        },
        vi.fn(),
      ),
    ).rejects.toThrow("Event details may already be saved");
  });

  it("retries only confirmed-unsaved lines with a fresh key and tolerates reordering", async () => {
    const first = ports({ failDish: ":cake" }),
      updates: EventWizardDraft["commitProgress"][] = [];
    await expect(
      commitEventWizard(first, draft(), (next) => updates.push(next)),
    ).rejects.toThrow("Could not add dish 'Cake'");
    const retry = ports();
    await commitEventWizard(
      retry,
      {
        ...draft(),
        dishes: [
          draft().dishes[1],
          draft().dishes[0],
          { lineId: "salad", dishId: "dish-3", dishName: "Salad" },
        ],
        commitProgress: updates.at(-1)!,
      },
      vi.fn(),
    );
    expect(retry.calls).toContain("dish:draft-1:dish:cake:a1");
    expect(retry.calls).toContain("dish:draft-1:dish:salad");
    expect(retry.calls).not.toContain("dish:draft-1:dish:pasta");
  });

  it.each([
    { clientId: "client", templateId: "", proposalId: "" },
    { clientId: "", templateId: "template", proposalId: "" },
    { clientId: "", templateId: "", proposalId: "proposal" },
  ])("keeps prefilled booking routes on the long form", (params) => {
    expect(guidedEventCreateAvailable(params)).toBe(false);
  });
  it("has stable payload fingerprints", () =>
    expect(eventWizardFingerprint({ b: 2, a: 1 })).toBe(
      eventWizardFingerprint({ a: 1, b: 2 }),
    ));
});
