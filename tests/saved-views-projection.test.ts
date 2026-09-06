// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/manifest-convex-react", () => ({
  useListSavedReportDefinition: () => [
    {
      _id: "mine",
      version: 1,
      name: "Mine",
      ownerId: "person-me",
      chartType: "list-view",
      status: "active",
      definition: {
        pageKey: "events",
        isDefault: true,
        state: { scope: "mine" },
      },
    },
    {
      _id: "shared",
      version: 1,
      name: "Shared",
      ownerId: "person-other",
      chartType: "list-view",
      status: "active",
      definition: {
        pageKey: "events",
        isDefault: true,
        state: { scope: "shared" },
      },
    },
    {
      _id: "other-page",
      version: 1,
      name: "Other",
      ownerId: "person-me",
      chartType: "list-view",
      status: "active",
      definition: {
        pageKey: "clients",
        isDefault: true,
        state: { scope: "other" },
      },
    },
  ],
  useSavedReportDefinitionArchive: () => vi.fn(),
}));
vi.mock("../src/lib/useAuthStatus", () => ({
  useAuthStatus: () => ({ personId: "person-me" }),
}));
vi.mock("../src/lib/useSavedViewOperations", () => ({
  useSavedViewOperations: () => ({ create: vi.fn(), setDefault: vi.fn() }),
}));
import { useSavedViews } from "../src/features/views/useSavedViews";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
describe("mounted personal saved-view projection", () => {
  it("selects only the current owner's views for the current page", () => {
    let result: any;
    function Probe() {
      result = useSavedViews("events", "events");
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(createElement(Probe)));
    expect(result.views).toEqual([
      expect.objectContaining({ id: "mine", state: { scope: "mine" } }),
    ]);
    expect(result.defaultView.id).toBe("mine");
    act(() => root.unmount());
  });
});
