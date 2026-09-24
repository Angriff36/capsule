import { describe, expect, it, vi } from "vitest";
import { CapsuleGeneratedCommandGateway } from "../../src/agent/CapsuleGeneratedCommandGateway";
import { CapsuleGeneratedWiringFacts } from "../../src/agent/CapsuleGeneratedWiringFacts";
import { CapsuleStaleReadRefresher } from "../../src/agent/CapsuleStaleReadRefresher";

describe("generated stale-read refresh", () => {
  it("refetches the changed dish list and a related prep list after add-to-event succeeds", async () => {
    const facts = new CapsuleGeneratedWiringFacts();
    const stale = facts.staleReadIds("EventDish.addToEvent");
    expect(stale).toContain("EventDish.list");
    expect(stale).toContain("PrepTask.list");

    const refetched: string[] = [];
    const refresher = new CapsuleStaleReadRefresher({
      refetch: async (exportName) => {
        refetched.push(exportName);
      },
    });
    const saved = await refresher.afterSuccess("EventDish.addToEvent", {
      eventDishId: "event-dish-1",
    });

    expect(saved).toEqual({ eventDishId: "event-dish-1" });
    expect(refetched).toContain("listEventDish");
    expect(refetched).toContain("listPrepTask");
    expect(refetched).not.toContain("getEventDish");
  });

  it("does not refetch when the command fails", async () => {
    const refresh = vi.fn();
    const gateway = new CapsuleGeneratedCommandGateway(
      {} as never,
      new CapsuleStaleReadRefresher({ refetch: refresh }),
    );
    await expect(
      gateway.finish("EventDish.addToEvent", {
        ok: false,
        kind: "guard_failure",
        message: "The dish is not on this menu.",
        status: 400,
      }),
    ).rejects.toThrow(/not on this menu/);
    expect(refresh).not.toHaveBeenCalled();
  });
});
