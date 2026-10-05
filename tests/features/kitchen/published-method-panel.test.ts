// @vitest-environment jsdom
/**
 * PL-REPLACEMENT-PROOF (Galley "cook sees the current method"): a cook sent
 * from a prep task reads the published edition's steps, not the draft.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PublishedMethodPanel } from "../../../src/features/kitchen/PublishedMethodPanel";
import type { PublishedEdition } from "../../../convex/lib/culinaryModel/recipeEdition";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const base: PublishedEdition = {
  edition: "published",
  versionNumber: 3,
  name: "Beurre blanc",
  category: "",
  cuisine: "",
  description: "",
  instructions: "Reduce, then mount with butter.",
  yieldQuantity: 1,
  yieldUnit: "portion",
  batchMultiplier: 1,
  servesPerYield: 1,
  lines: [],
  componentLines: [],
};

describe("published method for the cook", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("lists the published steps with their minutes", () => {
    act(() => {
      root.render(
        createElement(PublishedMethodPanel, {
          edition: {
            ...base,
            steps: [
              {
                instruction: "Reduce shallots in wine",
                sortOrder: 0,
                durationMinutes: 10,
              },
              { instruction: "Whisk in cold butter", sortOrder: 1 },
            ],
          },
        }),
      );
    });
    const text = container.textContent ?? "";
    expect(text).toContain("Follow edition 3");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(text).toContain("Reduce shallots in wine");
    expect(text).toContain("10 min");
  });

  it("falls back to the written method on an edition saved before steps were kept", () => {
    act(() => {
      root.render(createElement(PublishedMethodPanel, { edition: base }));
    });
    expect(container.querySelectorAll("li")).toHaveLength(0);
    expect(container.textContent).toContain("Reduce, then mount with butter.");
  });
});
