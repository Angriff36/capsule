import { readFileSync } from "node:fs";
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

const shell = readFileSync("src/app/shell/AppShell.tsx", "utf8");
const shortcuts = readFileSync("src/app/shell/keyboardShortcuts.ts", "utf8");
const app = readFileSync("src/app/App.tsx", "utf8");
const list = readFileSync("src/features/events/EventsListPage.tsx", "utf8");
const kitchen = readFileSync(
  "src/features/kitchen/KitchenDashboardPage.tsx",
  "utf8",
);
const facilities = readFileSync(
  "src/features/facilities/FacilitiesOverviewPage.tsx",
  "utf8",
);
const detail = readFileSync("src/features/events/EventDetailPage.tsx", "utf8");
const sidebar = readFileSync("src/app/shell/Sidebar.tsx", "utf8");

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

    expect(shell).toContain("isBrowserRefreshChord");
    expect(shell).not.toMatch(
      /shiftKey[\s\S]{0,80}["'][rR]["'][\s\S]{0,80}\/facilities/,
    );
    expect(shortcuts).not.toMatch(/["']R["'][\s\S]{0,40}\/facilities/);
    expect(shortcuts).not.toContain("/facilities");
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

  it("App, kitchen, facilities, and the events list do not rewrite to leftover event ids", () => {
    expect(eventsIndexPath()).toBe("/events");
    expect(app).toContain('path="/events"');
    expect(app).toContain("EventsListPage");
    expect(app).toContain('path="/kitchen"');
    expect(app).toContain("KitchenDashboardPage");
    expect(app).toContain('path="/facilities"');
    expect(app).not.toContain(WEDDING_ID);
    expect(app).not.toContain(TEST_EVENT_ID);
    expect(app).not.toMatch(
      /path="\/events"[\s\S]{0,160}Navigate to=\{?["'`]\/events\//,
    );
    expect(app).not.toMatch(
      /path="\/kitchen"[\s\S]{0,200}Navigate to=\{?["'`]\/events\//,
    );
    expect(app).not.toMatch(
      /path="\/facilities"[\s\S]{0,200}Navigate to=\{?["'`]\/events\//,
    );

    expect(list).not.toContain(WEDDING_ID);
    expect(list).not.toContain(TEST_EVENT_ID);
    expect(list).not.toMatch(/useEffect\([\s\S]{0,200}navigate\(/);
    expect(kitchen).not.toContain(WEDDING_ID);
    expect(kitchen).not.toContain(TEST_EVENT_ID);
    expect(kitchen).not.toMatch(/navigate\([`'"]\/events\//);
    expect(facilities).not.toContain(WEDDING_ID);
    expect(facilities).not.toContain(TEST_EVENT_ID);
    expect(facilities).not.toMatch(/navigate\([`'"]\/events\//);

    expect(detail).toContain("rememberLastViewedEvent");
    expect(detail).toContain("eventDetailPath");
    expect(sidebar).toContain("eventsIndexPath()");
  });
});
