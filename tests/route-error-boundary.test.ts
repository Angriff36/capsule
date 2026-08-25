// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
  type NavigateFunction,
} from "react-router-dom";
import { RouteErrorBoundary } from "../src/app/shell/RouteErrorBoundary";

// The exact shape Convex production sends for a server-side query failure.
const CONVEX_QUERY_ERROR =
  "[CONVEX Q(queries:getEvent)] [Request ID: f0b393d82ac7528e] Server Error Called by client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function ThrowingPage(): ReactNode {
  throw new Error(CONVEX_QUERY_ERROR);
}

let navigateRef: { current: NavigateFunction | null };

function NavigateGrabber() {
  navigateRef.current = useNavigate();
  return null;
}

/** Mirrors AppShell: router outside, boundary wrapping the routed pages. */
function testApp(initialPath: string) {
  return createElement(
    MemoryRouter,
    { initialEntries: [initialPath] },
    createElement(NavigateGrabber),
    createElement(RouteErrorBoundary, {
      children: createElement(
        Routes,
        {},
        createElement(Route, {
          path: "/events/:id",
          element: createElement(ThrowingPage),
        }),
        createElement(Route, {
          path: "/events",
          element: createElement("div", {}, "Events list rendered"),
        }),
      ),
    }),
  );
}

describe("RouteErrorBoundary", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    navigateRef = { current: null };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    // React logs caught boundary errors; keep test output clean.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("shows the generic failure state for a thrown get* query error — never a Not found page", () => {
    act(() => {
      root.render(testApp("/events/does-not-exist"));
    });
    const text = container.textContent ?? "";
    expect(text).toContain("This screen failed to load");
    // A thrown query error can be an outage, not a missing record; the
    // boundary must not claim the record does not exist.
    expect(text.toLowerCase()).not.toContain("not found");
    expect(text.toLowerCase()).not.toContain("does not exist");
    expect(text.toLowerCase()).not.toContain("doesn't exist");
  });

  it("does not leak query names or request ids in production builds", () => {
    vi.stubEnv("DEV", false);
    act(() => {
      root.render(testApp("/events/does-not-exist"));
    });
    const text = container.textContent ?? "";
    expect(text).toContain("This screen failed to load");
    expect(text).not.toContain("getEvent");
    expect(text).not.toContain("Request ID");
    expect(text).not.toContain("CONVEX");
  });

  it("resets when the route changes so the next page renders", () => {
    act(() => {
      root.render(testApp("/events/does-not-exist"));
    });
    expect(container.textContent).toContain("This screen failed to load");

    act(() => {
      navigateRef.current?.("/events");
    });
    expect(container.textContent).toContain("Events list rendered");
    expect(container.textContent).not.toContain("This screen failed to load");
  });
});
