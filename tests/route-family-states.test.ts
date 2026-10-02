// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SwitchedOffAreaGuard } from "../src/app/shell/SwitchedOffAreaGuard";
import { VenueDetailPage } from "../src/features/facilities/VenueDetailPage";
import { DishDetailPage } from "../src/features/kitchen/DishDetailPage";
import { ClientPortalPage } from "../src/features/clientPortal/ClientPortalPage";

// AC-170 route-family states: loading that never ends must turn into a
// plain "isn't loading" message, and a switched-off area must say so when
// its address is typed instead of opening an empty page.

const PLAUSIBLE_ID = "j570xjfxqrgv9dxdwqvxjxrghd7n8sez";

const harness = vi.hoisted(() => ({
  record: undefined as unknown,
  convexQuery: undefined as unknown,
}));

vi.mock("../src/lib/manifest-convex-react", () => {
  const emptyList: unknown[] = [];
  const commandHook = () => async () => undefined;
  return new Proxy(
    {},
    {
      has: () => true,
      get(_target, prop) {
        if (typeof prop !== "string" || prop === "then" || prop === "default") {
          return undefined;
        }
        if (prop.startsWith("useGet")) {
          return (id: string) => (id === "skip" ? undefined : harness.record);
        }
        if (prop.startsWith("useList")) return () => emptyList;
        return commandHook;
      },
    },
  );
});

vi.mock("convex/react", () => ({
  useQuery: () => harness.convexQuery,
  useMutation: () => async () => undefined,
  useAction: () => async () => undefined,
  useConvex: () => ({}),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(path: string, pattern: string, element: ReactElement) {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(
          Routes,
          {},
          createElement(Route, { path: pattern, element }),
        ),
      ),
    );
  });
}

function waitTooLong() {
  act(() => {
    vi.advanceTimersByTime(10_001);
  });
}

describe("route-family states (AC-170)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    harness.record = undefined;
    harness.convexQuery = undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("venue page: loading turns into a plain message, a bad address is not found", () => {
    mount(
      `/venues/${PLAUSIBLE_ID}`,
      "/venues/:id",
      createElement(VenueDetailPage),
    );
    expect(container.textContent).not.toContain("isn't loading");
    waitTooLong();
    expect(container.textContent).toContain("This venue isn't loading");

    act(() => root.unmount());
    root = createRoot(container);
    mount("/venues/skip", "/venues/:id", createElement(VenueDetailPage));
    expect(container.textContent).toContain("Venue not found");
  });

  it("dish page: loading turns into a plain message", () => {
    mount(
      `/dishes/${PLAUSIBLE_ID}`,
      "/dishes/:id",
      createElement(DishDetailPage),
    );
    expect(container.textContent).not.toContain("isn't loading");
    waitTooLong();
    expect(container.textContent).toContain("This dish isn't loading");
  });

  it("client event view: a slow load tells the client what to do", () => {
    mount(
      "/portal/events/abc",
      "/portal/events/:token",
      createElement(ClientPortalPage),
    );
    expect(container.textContent).toContain("Gathering the latest details");
    expect(container.textContent).not.toContain("taking longer");
    waitTooLong();
    expect(container.textContent).toContain("taking longer than it should");
  });

  it("a switched-off area says so when its address is typed", () => {
    harness.convexQuery = { disabledCapabilities: ["kitchen"] };
    mount(
      "/kitchen/catalog",
      "*",
      createElement(SwitchedOffAreaGuard, {
        children: createElement("p", {}, "Kitchen page"),
      }),
    );
    expect(container.textContent).toContain("This area is switched off");
    expect(container.textContent).not.toContain("Kitchen page");

    act(() => root.unmount());
    root = createRoot(container);
    mount(
      "/events",
      "*",
      createElement(SwitchedOffAreaGuard, {
        children: createElement("p", {}, "Events page"),
      }),
    );
    expect(container.textContent).toContain("Events page");
  });
});
