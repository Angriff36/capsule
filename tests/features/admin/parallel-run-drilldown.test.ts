// @vitest-environment jsdom
// AC-286 — every difference the daily TPP comparison found opens the TPP
// record and the Capsule event, can be given to a person, and settled.
// Convex is mocked at the hook layer; the comparison itself, the saved
// assignment and the next day's clear/reopen are proven at runtime in
// tests/proofs/parallel-run-comparison.runtime.test.ts.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParallelRunDifferences } from "../../../src/features/admin/import/ParallelRunDifferences";
import type { ParallelRunDifferenceRow } from "../../../convex/parallelRun";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  assign: vi.fn(async () => null),
  settle: vi.fn(async () => null),
  reopen: vi.fn(async () => null),
  acceptAll: vi.fn(async () => ({ accepted: 2 })),
  askReason: vi.fn(async () => "TPP keeps its own stages"),
}));

vi.mock("../../../src/lib/manifest-convex-react", () => ({
  useListPerson: () => [
    {
      _id: "person-kim",
      givenName: "Kim",
      familyName: "Cook",
      deletedAt: null,
    },
  ],
  useParallelRunDifferenceAssign: () => harness.assign,
  useParallelRunDifferenceSettle: () => harness.settle,
  useParallelRunDifferenceReopen: () => harness.reopen,
}));

vi.mock("convex/react", () => ({
  useMutation: () => harness.acceptAll,
}));

vi.mock("../../../src/ui/action-prompt", () => ({
  useActionPrompt: () => ({
    prompt: { askReason: harness.askReason },
    host: null,
  }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  for (const fn of Object.values(harness)) fn.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function row(
  id: string,
  field: string,
  extra: Partial<ParallelRunDifferenceRow> = {},
): ParallelRunDifferenceRow {
  return {
    id: id as ParallelRunDifferenceRow["id"],
    version: 2,
    field,
    status: "open",
    sourceValue: "approved",
    capsuleValue: "planning",
    externalId: "7001",
    tppTitle: "Ashley's wedding",
    importRunId: "run-9",
    eventId: "event-1",
    eventTitle: "Ashley's wedding",
    assignedToPersonId: null,
    assignedToName: null,
    resolutionNote: null,
    firstSeenAt: 1,
    lastSeenAt: 2,
    ...extra,
  };
}

async function render(rows: ParallelRunDifferenceRow[]) {
  await act(async () =>
    root.render(
      createElement(
        MemoryRouter,
        null,
        createElement(ParallelRunDifferences, {
          differences: rows,
          total: rows.length,
        }),
      ),
    ),
  );
}

const button = (text: string) =>
  [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  )!;

function choose(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )!.set!.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("parallel run drill-down (AC-286)", () => {
  it("every mismatch row links to both source coordinates and the Capsule record and can be assigned to a person", async () => {
    await render([
      row("d-stage", "stage"),
      row("d-price", "price", {
        sourceValue: "$5000.00",
        capsuleValue: "$4500.00",
      }),
    ]);
    const links = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    // TPP side: the import that read that TPP event; Capsule side: the event.
    expect(
      links.filter((href) => href === "/admin/imports/run-9"),
    ).toHaveLength(2);
    expect(links.filter((href) => href?.includes("event-1"))).toHaveLength(2);
    expect(container.textContent).toContain("7001");
    expect(container.textContent).toContain("Ashley's wedding");
    expect(container.textContent).toContain("$5000.00");
    expect(container.textContent).toContain("$4500.00");

    const giveTo = container.querySelector(
      'select[aria-label^="Give TPP event 7001 Price"]',
    ) as HTMLSelectElement;
    await act(async () => choose(giveTo, "person-kim"));
    expect(harness.assign).toHaveBeenCalledWith({
      docId: "d-price",
      version: 2,
      assignedToPersonId: "person-kim",
    });
  });

  it("settles a row as fixed or fine, and a whole kind as fine with a reason", async () => {
    await render([
      row("d-stage", "stage"),
      row("d-price", "price"),
      row("d-old", "guests", { status: "accepted", resolutionNote: "ok" }),
    ]);
    await act(async () => button("Fixed").click());
    expect(harness.settle).toHaveBeenCalledWith({
      docId: "d-stage",
      version: 2,
      resolution: "fixed",
    });
    await act(async () =>
      [...container.querySelectorAll("button")]
        .filter((b) => b.textContent === "Fine as is")[1]!
        .click(),
    );
    expect(harness.settle).toHaveBeenLastCalledWith({
      docId: "d-price",
      version: 2,
      resolution: "accepted",
      note: "TPP keeps its own stages",
    });
    await act(async () => button("Open again").click());
    expect(harness.reopen).toHaveBeenCalledWith({ docId: "d-old", version: 2 });

    const kind = container.querySelector(
      "#difference-field",
    ) as HTMLSelectElement;
    await act(async () => choose(kind, "stage"));
    await act(async () => button("Mark all 1 fine").click());
    expect(harness.acceptAll).toHaveBeenCalledWith({
      field: "stage",
      note: "TPP keeps its own stages",
    });
  });
});
