// @vitest-environment jsdom
import { act, createElement } from "react";
import { expect, it, vi } from "vitest";
import {
  backend,
  container,
  mount,
  change,
  click,
  location,
} from "./support/mounted-app";
import { CommandPalette } from "../src/app/shell/CommandPalette";

it("drops stale hits while typing, waits for the live search, and opens the returned invoice", async () => {
  vi.useFakeTimers();
  try {
    const close = vi.fn();
    const page = () =>
      createElement(CommandPalette, { open: true, onClose: close });
    await mount(page());
    const search = container.querySelector("input")!;
    change(search, "Harborview");
    expect(container.textContent).toContain("Searching…");
    expect(container.textContent).not.toContain("No matches.");
    await act(async () => vi.advanceTimersByTime(180));
    expect(backend.reads).toHaveBeenCalledWith("search:searchAll", {
      query: "Harborview",
      now: expect.any(Number),
    });
    backend.values.set("search:searchAll", [
      {
        kind: "client",
        id: "client-a",
        label: "Harborview Tech",
        hint: "Client",
        path: "/clients/client-a",
        score: 1,
      },
    ]);
    await mount(page());
    expect(container.textContent).toContain("Harborview Tech");
    change(search, "Northside");
    expect(container.textContent).not.toContain("Harborview Tech");
    expect(container.textContent).toContain("Searching…");
    expect(container.textContent).not.toContain("No matches.");
    backend.values.delete("search:searchAll");
    await act(async () => vi.advanceTimersByTime(180));
    expect(container.textContent).toContain("Searching…");
    backend.values.set("search:searchAll", []);
    await mount(page());
    expect(container.textContent).toContain("No matches.");
    change(search, "unpaid invoices over 30 days");
    await act(async () => vi.advanceTimersByTime(180));
    backend.values.set("search:searchAll", [
      {
        kind: "invoice",
        id: "invoice-a",
        label: "#INV-204 — $900",
        hint: "Overdue 31d",
        path: "/finance/invoices/invoice-a",
        score: 1,
      },
    ]);
    await mount(page());
    const hit = [...container.querySelectorAll("button")].find((node) =>
      node.textContent?.includes("#INV-204 — $900"),
    )!;
    expect(hit).toBeDefined();
    await click(hit);
    expect(location).toBe("/finance/invoices/invoice-a");
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
