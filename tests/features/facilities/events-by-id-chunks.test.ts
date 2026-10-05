// @vitest-environment jsdom
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { backend, container, mount } from "../../support/mounted-app";
import { useEventsById } from "../../../src/features/facilities/useEventsById";

// #430: one server read takes 1000 ids. A screen naming more events than
// that used to lose the rest without a word; the hook now reads in pieces.
function Count({ ids }: { ids: string[] }) {
  const rows = useEventsById(ids);
  return createElement(
    "p",
    null,
    rows === undefined ? "loading" : `found ${rows.length}`,
  );
}

describe("events by id read in pieces (#430)", () => {
  it("finds all 2500 named events, one read per 1000 ids", async () => {
    const events = Array.from({ length: 2500 }, (_, i) => ({
      _id: `event-${i}`,
      title: `Event ${i}`,
    }));
    backend.values.set("useListEvent", events);
    await mount(
      createElement(Count, { ids: events.map((event) => event._id) }),
    );
    expect(container.textContent).toContain("found 2500");
    const reads = backend.reads.mock.calls.filter(
      ([name, args]) => name === "eventLookup:byIds" && args !== "skip",
    );
    expect(
      Math.max(
        ...reads.map(([, args]) => (args as { ids: string[] }).ids.length),
      ),
    ).toBe(1000);
  });

  it("answers an empty list at once, with no read", async () => {
    await mount(createElement(Count, { ids: [] }));
    expect(container.textContent).toContain("found 0");
  });
});
