// @vitest-environment jsdom
// AC-045 — resumable recipe review through the ordinary import route:
// list/resume by ?importId, durable save states, conflict/failed-save edit
// retention, completed-import source provenance, and the component-detail
// original-source panel. Convex is mocked at the hook layer; the durable
// round-trip itself is proven in tests/proofs/safe-culinary-operations.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComponentDetailPage } from "../../../src/features/kitchen/ComponentDetailPage";
import { ComponentImportPage } from "../../../src/features/kitchen/import/ComponentImportPage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Plausible Convex id shapes (routeRecord accepts 25–40 lowercase base32).
const IMPORT_ID = "k57wg2c8v4b6n1m3x9q7t5j2d4";
const COMPONENT_ID = "j39h6k2m8p4q7r1s5t9w3x2y6";

const PASTE = `One-Pot Chili

A low-fat chili that is easy to clean up.

Yield: 6 servings

Ingredients:
1 lb lean ground turkey
2 tsp chili powder
`;

const harness = vi.hoisted(() => ({
  importComponent: vi.fn(),
  createReview: vi.fn(),
  saveReview: vi.fn(),
  storedImport: undefined as unknown,
  storedLines: undefined as unknown,
  allImports: undefined as unknown,
  component: undefined as unknown,
  ingredients: [] as {
    _id: string;
    name: string;
    unit?: string;
    deletedAt: null;
  }[],
}));

// The page no longer reads Convex directly (culinary integration guard);
// this mock only serves real modules like useAuthStatus.
vi.mock("convex/react", () => ({
  useQuery: () => undefined,
}));

vi.mock("../../../src/lib/safeCulinaryOperations", () => ({
  useImportComponentSafely: () => harness.importComponent,
  useCreateComponentImportReview: () => harness.createReview,
  useSaveComponentImportReview: () => harness.saveReview,
  useRestoreComponentSnapshotSafely: () => vi.fn(),
  useCloneMenuSafely: () => vi.fn(),
}));

vi.mock("../../../src/lib/manifest-convex-react", () => {
  const commandHook = () => vi.fn(async () => ({ docId: "created-1" }));
  return new Proxy(
    {},
    {
      has: () => true,
      get(_target, prop) {
        if (typeof prop !== "string" || prop === "then" || prop === "default")
          return undefined;
        if (prop === "useListIngredient") return () => harness.ingredients;
        if (prop === "useGetComponentImport") return () => harness.storedImport;
        if (prop === "useListComponentImport") return () => harness.allImports;
        // Tenant-wide line list; the page filters it to the open import.
        if (prop === "useListComponentImportLine")
          return () => harness.storedLines;
        if (prop === "useGetComponent") return () => harness.component;
        if (prop.startsWith("useList")) return () => [];
        return commandHook;
      },
    },
  );
});

function storedReviewRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: IMPORT_ID,
    tenantId: "tenant-1",
    deletedAt: null,
    sourceKind: "pasted_text",
    sourceFilename: "dressing.txt",
    rawSourceText: "House dressing\nYield: 4 liter\n\n2 cup olive oil",
    csvSheetText: null,
    csvLinesText: null,
    parsedName: "House dressing",
    parsedDescription: null,
    parsedCategory: null,
    parsedCuisine: null,
    parsedInstructions: null,
    parsedYieldQuantity: null,
    parsedYieldUnit: null,
    parsedBatchMultiplier: null,
    parsedLineCount: 1,
    resolvedLineCount: 1,
    reviewRevision: 1,
    status: "reviewing",
    resultingComponentId: null,
    uploadedAt: 1,
    updatedAt: 5,
    version: 1,
    ...overrides,
  };
}

function storedLineRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: "l1",
    tenantId: "tenant-1",
    deletedAt: null,
    importId: IMPORT_ID,
    sourceOrder: 0,
    sourceLine: "2 cup olive oil",
    parsedQuantity: 2,
    parsedUnit: "cup",
    parsedIngredientName: "Olive Oil",
    preparationNote: null,
    matchStatus: "confirmed_existing",
    matchedIngredientId: "ing-olive",
    possibleMatchIngredientIds: [],
    resolvedAt: 3,
    version: 1,
    ...overrides,
  };
}

describe("ComponentImportPage resumable review", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    harness.importComponent.mockReset();
    harness.createReview.mockReset();
    harness.saveReview.mockReset();
    harness.storedImport = undefined;
    harness.storedLines = [];
    harness.allImports = [];
    harness.component = undefined;
    harness.ingredients = [];
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function renderPage(entry = "/kitchen/components/import") {
    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: [entry] },
          createElement(ComponentImportPage),
        ),
      );
    });
  }

  async function rerenderPage(entry = "/kitchen/components/import") {
    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: [entry] },
          createElement(ComponentImportPage),
        ),
      );
    });
  }

  const setTextInputValue = (
    input: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ) => {
    const proto =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    act(() => {
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  const setSelectValue = (select: HTMLSelectElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(select, value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  const clickButton = async (label: string) => {
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === label)
        ?.click();
    });
  };

  const saveStatus = () =>
    container.querySelector(".component-import-save-state")?.textContent ??
    null;

  const yieldQuantityInput = () =>
    container.querySelector<HTMLInputElement>(
      ".component-import-yield input[type='number']",
    );

  it("lists resumable imports and deep-links them by ?importId", async () => {
    harness.allImports = [
      storedReviewRow({
        _id: "a57wg2c8v4b6n1m3x9q7t5j2d4",
        parsedName: "House dressing",
        updatedAt: 5,
      }),
      storedReviewRow({
        _id: "b57wg2c8v4b6n1m3x9q7t5j2d4",
        parsedName: "Old ribs rub",
        status: "completed",
        updatedAt: 4,
      }),
    ];
    await renderPage();
    const list = container.querySelector(
      "[aria-label='Saved reviews in progress']",
    );
    expect(list).not.toBeNull();
    expect(list?.textContent).toContain("House dressing");
    expect(list?.textContent).not.toContain("Old ribs rub");
    const resume = Array.from(list?.querySelectorAll("a") ?? []).find(
      (anchor) => anchor.textContent?.includes("Resume"),
    );
    expect(resume?.getAttribute("href")).toBe(
      "/kitchen/components/import?importId=a57wg2c8v4b6n1m3x9q7t5j2d4",
    );
  });

  it("saves a parsed paste as a durable review, confirms Saved, and keeps the source readable", async () => {
    harness.createReview.mockResolvedValue({
      importId: IMPORT_ID,
      reviewRevision: 0,
      lineIds: ["l1", "l2"],
    });
    await renderPage();
    const textarea = container.querySelector<HTMLTextAreaElement>(
      "#component-import-source",
    )!;
    setTextInputValue(textarea, PASTE);
    await clickButton("Parse");
    expect(
      container.querySelector("[aria-label='Structured review']"),
    ).not.toBeNull();
    await clickButton("Save review");
    expect(harness.createReview).toHaveBeenCalledTimes(1);
    const request = harness.createReview.mock.calls[0][0] as {
      source: { rawText: string; kind: string };
      lines: { match?: { matchStatus: string } }[];
    };
    expect(request.source.rawText).toBe(PASTE);
    expect(request.source.kind).toBe("pasted_text");
    expect(request.lines.some((line) => line.match?.matchStatus)).toBe(true);
    expect(saveStatus()).toBe("Saved");
    const panel = container.querySelector("[aria-label='Original source']");
    expect(panel?.textContent).toContain("One-Pot Chili");
    expect(panel?.textContent).toContain("Corrections never change this text.");
  });

  it("loads a saved review by ?importId and saves corrections with the expected revision", async () => {
    harness.storedImport = storedReviewRow();
    harness.storedLines = [storedLineRow()];
    harness.saveReview.mockResolvedValue({ reviewRevision: 2 });
    await renderPage(`/kitchen/components/import?importId=${IMPORT_ID}`);
    const panel = container.querySelector("[aria-label='Original source']");
    expect(panel?.textContent).toContain("House dressing");
    expect(panel?.textContent).toContain("dressing.txt");
    const quantity = yieldQuantityInput();
    expect(quantity).not.toBeNull();
    setTextInputValue(quantity!, "10");
    setSelectValue(
      container.querySelector<HTMLSelectElement>(
        ".component-import-yield select",
      )!,
      "liter",
    );
    await clickButton("Save review");
    expect(harness.saveReview).toHaveBeenCalledTimes(1);
    expect(harness.saveReview).toHaveBeenCalledWith(
      expect.objectContaining({
        importId: IMPORT_ID,
        expectedReviewRevision: 1,
        header: expect.objectContaining({
          yieldQuantity: 10,
          yieldUnit: "liter",
        }),
      }),
    );
    expect(saveStatus()).toBe("Saved");
  });

  it("keeps entered values on a failed save and retries successfully", async () => {
    harness.storedImport = storedReviewRow();
    harness.storedLines = [storedLineRow()];
    harness.saveReview
      .mockRejectedValueOnce(new Error("convex unavailable"))
      .mockResolvedValueOnce({ reviewRevision: 2 });
    await renderPage(`/kitchen/components/import?importId=${IMPORT_ID}`);
    setTextInputValue(yieldQuantityInput()!, "10");
    await clickButton("Save review");
    expect(saveStatus()).toBe("Save failed — your edits are kept.");
    expect(yieldQuantityInput()!.value).toBe("10");
    await clickButton("Retry save");
    expect(harness.saveReview).toHaveBeenCalledTimes(2);
    expect(saveStatus()).toBe("Saved");
  });

  it("preserves local edits on a stale-revision conflict and reloads the saved version on request", async () => {
    harness.storedImport = storedReviewRow();
    harness.storedLines = [storedLineRow()];
    harness.saveReview.mockRejectedValue(
      new Error("stale review revision: expected 1, stored 2"),
    );
    await renderPage(`/kitchen/components/import?importId=${IMPORT_ID}`);
    setTextInputValue(yieldQuantityInput()!, "10");
    await clickButton("Save review");
    expect(saveStatus()).toBe("Saved by someone else — your edits are kept.");
    expect(yieldQuantityInput()!.value).toBe("10");
    // The stored version moves to revision 2 with its own correction.
    harness.storedImport = storedReviewRow({
      reviewRevision: 2,
      parsedYieldQuantity: 4,
      parsedYieldUnit: "liter",
    });
    await rerenderPage(`/kitchen/components/import?importId=${IMPORT_ID}`);
    expect(yieldQuantityInput()!.value).toBe("10");
    await clickButton("Reload saved version");
    expect(yieldQuantityInput()!.value).toBe("4");
    expect(saveStatus()).toBeNull();
  });

  it("shows a completed import with its component link and original source", async () => {
    harness.storedImport = storedReviewRow({
      status: "completed",
      resultingComponentId: COMPONENT_ID,
      rawSourceText: "DONE SOURCE\n2 cup olive oil",
      parsedYieldQuantity: 4,
      parsedYieldUnit: "liter",
    });
    await renderPage(`/kitchen/components/import?importId=${IMPORT_ID}`);
    expect(container.textContent).toContain("This import is complete.");
    const open = Array.from(container.querySelectorAll("a")).find((anchor) =>
      anchor.textContent?.includes("Open component"),
    );
    expect(open?.getAttribute("href")).toBe(
      `/kitchen/components/${COMPONENT_ID}`,
    );
    expect(
      container.querySelector("[aria-label='Original source']")?.textContent,
    ).toContain("DONE SOURCE");
  });

  it("explains a missing import plainly and leaks no source", async () => {
    harness.storedImport = null;
    harness.storedLines = [];
    await renderPage(`/kitchen/components/import?importId=${IMPORT_ID}`);
    expect(container.textContent).toContain(
      "This saved import cannot be opened.",
    );
    expect(
      container.querySelector("[aria-label='Original source']"),
    ).toBeNull();
  });

  it("renders source text as text, never HTML", async () => {
    harness.storedImport = storedReviewRow({
      rawSourceText: "<script>alert('poison')</script>",
    });
    await renderPage(`/kitchen/components/import?importId=${IMPORT_ID}`);
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert('poison')</script>");
  });
});

describe("ComponentDetailPage import provenance", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    harness.component = {
      _id: COMPONENT_ID,
      tenantId: "tenant-1",
      deletedAt: null,
      name: "House dressing",
      status: "draft",
      yieldQuantity: 4,
      yieldUnit: "liter",
      batchMultiplier: 1,
      servesPerYield: null,
      category: null,
      cuisine: null,
      description: null,
      instructions: null,
      version: 1,
    };
    harness.ingredients = [];
    harness.storedImport = undefined;
    harness.storedLines = [];
    harness.allImports = [];
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows the original source of its completed import, and nothing for native components", async () => {
    harness.allImports = [
      storedReviewRow({
        status: "completed",
        resultingComponentId: COMPONENT_ID,
        rawSourceText: "ORIGINAL RECIPE SOURCE",
        completedAt: 9,
      }),
    ];
    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: [`/kitchen/components/${COMPONENT_ID}`] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/kitchen/components/:id",
              element: createElement(ComponentDetailPage),
            }),
          ),
        ),
      );
    });
    const panel = container.querySelector("[aria-label='Original source']");
    expect(panel?.textContent).toContain("ORIGINAL RECIPE SOURCE");
    expect(panel?.textContent).toContain(IMPORT_ID);

    // A native component with no import renders no provenance panel, no error.
    harness.allImports = [];
    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: [`/kitchen/components/${COMPONENT_ID}`] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/kitchen/components/:id",
              element: createElement(ComponentDetailPage),
            }),
          ),
        ),
      );
    });
    expect(
      container.querySelector("[aria-label='Original source']"),
    ).toBeNull();
    expect(container.textContent).toContain("House dressing");
  });
});
