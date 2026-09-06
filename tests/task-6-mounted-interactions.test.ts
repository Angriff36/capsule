// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  attachments: [] as any[],
  removeAttachment: vi.fn(),
  event: null as any,
  attribution: null as any,
}));

vi.mock("convex/react", () => ({
  useQuery: () => hooks.attachments,
  useMutation: () => vi.fn(),
}));
vi.mock("../src/lib/manifest-convex-react", () => ({
  useAttachmentRemove: () => hooks.removeAttachment,
  useCreateAttachment: () => vi.fn(),
  useGetRevenueAttribution: () => hooks.attribution,
  useGetEvent: () => hooks.event,
  useListVenue: () => [],
  useListPerson: () => [],
  useListReferralSource: () => [],
  useListClient: () => [],
  useRevenueAttributionCreate: () => vi.fn(),
  useRevenueAttributionApply: () => vi.fn(),
  useRevenueAttributionUpdate: () => vi.fn(),
}));

import { AttachmentsSection } from "../src/features/attachments/AttachmentsSection";
import { RevenueAttributionDetailPage } from "../src/features/finance/RevenueAttributionDetailPage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("task 6 mounted interactions", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hooks.removeAttachment.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("awaits attachment removal, disables the pending row, and surfaces rejection", async () => {
    hooks.attachments = [
      {
        _id: "attachment-1",
        version: 2,
        fileName: "menu.pdf",
        fileSize: 10,
        uploadedAt: 1,
        url: null,
      },
    ];
    let reject!: (error: Error) => void;
    hooks.removeAttachment.mockReturnValue(
      new Promise((_, no) => {
        reject = no;
      }),
    );
    act(() =>
      root.render(
        createElement(AttachmentsSection, {
          parentType: "client",
          parentId: "c1",
        }),
      ),
    );
    const button = [...container.querySelectorAll("button")].find(
      (node) => node.textContent === "Remove",
    )!;
    act(() => button.click());
    expect(button.disabled).toBe(true);
    expect(hooks.removeAttachment).toHaveBeenCalledTimes(1);
    act(() => button.click());
    expect(hooks.removeAttachment).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("Removal failed")));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Removal failed",
    );
    expect(button.disabled).toBe(false);
    hooks.removeAttachment.mockResolvedValueOnce(undefined);
    await act(async () => button.click());
    expect(hooks.removeAttachment).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(button.disabled).toBe(false);
  });

  it("retains an operator-edited apply amount and provenance across reactive event refresh", () => {
    const attributionId = "j57b24z55c2gf3p9n4k6m8q1x";
    hooks.attribution = {
      _id: attributionId,
      version: 1,
      eventId: "e1",
      status: "approved",
      attributionType: "sales_commission",
      allocationMethod: "percent",
      percentBasis: 10,
      fixedAmount: 0,
    };
    hooks.event = {
      _id: "e1",
      title: "Dinner",
      quotedPrice: 1000,
      budgetAmount: 900,
    };
    window.history.pushState(
      {},
      "",
      `/finance/attribution/${attributionId}/apply`,
    );
    const render = () =>
      act(() =>
        root.render(
          createElement(
            BrowserRouter,
            {
              future: { v7_startTransition: true, v7_relativeSplatPath: true },
            },
            createElement(
              Routes,
              null,
              createElement(Route, {
                path: "/finance/attribution/:id/:mode",
                element: createElement(RevenueAttributionDetailPage),
              }),
            ),
          ),
        ),
      );
    render();
    const input = container.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "1250");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(input.value).toBe("1250");
    expect(container.textContent).toContain("Prefilled from: Operator entered");
    hooks.event = { ...hooks.event, quotedPrice: 1400 };
    render();
    expect(input.value).toBe("1250");
    expect(container.textContent).toContain("Prefilled from: Operator entered");
  });
});
