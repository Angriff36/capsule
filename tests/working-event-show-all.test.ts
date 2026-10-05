// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import {
  useWorkingEventScope,
  type WorkingEventScope,
} from "../src/features/events/WorkingEventScope";

// #374 item 2: "Show all events" is kept per screen for the browser tab, so a
// return visit shows what the operator last chose.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let scope: WorkingEventScope | null = null;

function Probe({ screen }: { screen: string }) {
  scope = useWorkingEventScope(screen);
  return null;
}

function visit(screen: string) {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(Probe, { screen })));
  return () => act(() => root.unmount());
}

afterEach(() => sessionStorage.clear());

it("keeps the choice for a screen across visits in the same tab", () => {
  let leave = visit("invoices");
  expect(scope?.showAll).toBe(false);
  act(() => scope?.setShowAll(true));
  expect(scope?.showAll).toBe(true);
  leave();

  leave = visit("invoices");
  expect(scope?.showAll).toBe(true);
  act(() => scope?.setShowAll(false));
  leave();

  leave = visit("invoices");
  expect(scope?.showAll).toBe(false);
  leave();
});

it("keeps each screen's choice apart", () => {
  let leave = visit("deliveries");
  act(() => scope?.setShowAll(true));
  leave();

  leave = visit("pack-lists");
  expect(scope?.showAll).toBe(false);
  leave();

  leave = visit("deliveries");
  expect(scope?.showAll).toBe(true);
  leave();
});
