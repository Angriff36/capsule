import { describe, expect, it } from "vitest";
import {
  appRouteForKeydown,
  isBrowserRefreshChord,
  shouldFireSingleKeyNav,
} from "../src/app/shell/singleKeyNav";
import { eventsIndexPath } from "../src/features/events/eventRoutes";
import {
  isProtectedFromLastViewedRestore,
  locationAfterLastViewedRestore,
  rememberLastViewedEvent,
} from "../src/features/events/lastViewedEvent";

const WEDDING_ID = "nn7ez3fz56ya246m6p17az2ad58crnwg";
const TEST_EVENT_ID = "nn75nfd";

describe("browser refresh chords are not app routes", () => {
  it("does not bind Ctrl+Shift+R or other refresh chords to a route", () => {
    const refresh = {
      key: "R",
      ctrlKey: true,
      shiftKey: true,
      metaKey: false,
      altKey: false,
      target: { tagName: "BODY" },
    };
    expect(isBrowserRefreshChord(refresh)).toBe(true);
    expect(shouldFireSingleKeyNav(refresh)).toBe(false);
    expect(appRouteForKeydown(refresh)).toBeNull();
    expect(
      appRouteForKeydown({
        key: "r",
        ctrlKey: true,
        shiftKey: false,
        target: { tagName: "BODY" },
      }),
    ).toBeNull();
    expect(
      appRouteForKeydown({
        key: "r",
        metaKey: true,
        shiftKey: true,
        target: { tagName: "BODY" },
      }),
    ).toBeNull();
    expect(appRouteForKeydown(refresh)).not.toBe("/facilities");
    expect(appRouteForKeydown(refresh)).not.toBe("/reports");
  });
});

describe("last-viewed event does not steal kitchen, facilities, or the events list", () => {
  it("keeps /kitchen, /facilities, and /events off the last-viewed event", () => {
    rememberLastViewedEvent(`/events/${WEDDING_ID}?tab=menu`);

    expect(locationAfterLastViewedRestore("/kitchen")).toBe("/kitchen");
    expect(locationAfterLastViewedRestore("/kitchen/prep")).toBe(
      "/kitchen/prep",
    );
    expect(locationAfterLastViewedRestore("/facilities")).toBe("/facilities");
    expect(locationAfterLastViewedRestore(eventsIndexPath())).toBe(
      eventsIndexPath(),
    );
    expect(locationAfterLastViewedRestore("/events")).toBe("/events");

    for (const path of ["/kitchen", "/facilities", "/events"]) {
      expect(isProtectedFromLastViewedRestore(path)).toBe(true);
      const resolved = locationAfterLastViewedRestore(path);
      expect(resolved).not.toContain(WEDDING_ID);
      expect(resolved).not.toContain(TEST_EVENT_ID);
      expect(resolved).not.toMatch(/\/events\/nn7ez3fz/);
      expect(resolved).not.toMatch(/\/events\/nn75nfd/);
    }
  });
});
