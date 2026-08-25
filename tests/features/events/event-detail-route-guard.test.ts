import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "../../../src/features/events/EventDetailPage";

// A real Convex document id shape: 32 lowercase base32 characters.
const PLAUSIBLE_ID = "j570xjfxqrgv9dxdwqvxjxrghd7n8sez";

const harness = vi.hoisted(() => ({
  // What useGetEvent resolves to for a non-skipped id.
  eventResult: null as unknown,
  getEventCalls: [] as string[],
}));

// EventDetailPage's import graph pulls in dozens of generated hooks. The
// Proxy answers all of them: list hooks stay loading-safe ([]), command
// hooks are inert async fns, and useGetEvent records what id reached it —
// the seam this test exists to pin down.
vi.mock("../../../src/lib/manifest-convex-react", () => {
  const emptyList: unknown[] = [];
  const commandHook = () => async () => undefined;
  return new Proxy(
    {},
    {
      // Vitest verifies exports with `in` before reading them.
      has: () => true,
      get(_target, prop) {
        if (typeof prop !== "string" || prop === "then" || prop === "default") {
          return undefined;
        }
        if (prop === "useGetEvent") {
          return (idArg: string) => {
            harness.getEventCalls.push(idArg);
            return idArg === "skip" ? undefined : harness.eventResult;
          };
        }
        if (prop.startsWith("useList")) return () => emptyList;
        if (prop.startsWith("useGet")) return () => null;
        return commandHook;
      },
    },
  );
});

vi.mock("@clerk/react", () => ({
  useOrganization: () => ({ organization: null, isLoaded: true }),
}));

// beoPdf pulls jspdf (browser-oriented); the button is never rendered here.
vi.mock("../../../src/features/events/beoPdf", () => ({
  downloadBeoPdf: async () => undefined,
}));

function renderAt(path: string) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        Routes,
        {},
        createElement(Route, {
          path: "/events/:id",
          element: createElement(EventDetailPage),
        }),
      ),
    ),
  );
}

describe("EventDetailPage unknown-record guard", () => {
  beforeEach(() => {
    harness.eventResult = null;
    harness.getEventCalls = [];
  });

  it("never sends an implausible URL id to the generated query and renders the unavailable state", () => {
    const markup = renderAt("/events/does-not-exist");
    expect(harness.getEventCalls).toContain("skip");
    expect(harness.getEventCalls).not.toContain("does-not-exist");
    expect(markup).toContain("Event unavailable");
  });

  it("renders the same unavailable state when a plausible id resolves to null (missing record)", () => {
    harness.eventResult = null;
    const markup = renderAt(`/events/${PLAUSIBLE_ID}`);
    expect(harness.getEventCalls).toContain(PLAUSIBLE_ID);
    expect(markup).toContain("Event unavailable");
  });

  it("keeps the loading state for a plausible id that has not resolved yet", () => {
    harness.eventResult = undefined;
    const markup = renderAt(`/events/${PLAUSIBLE_ID}`);
    expect(harness.getEventCalls).toContain(PLAUSIBLE_ID);
    expect(markup).not.toContain("Event unavailable");
  });
});
