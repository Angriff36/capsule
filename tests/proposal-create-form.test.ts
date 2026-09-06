// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const draftMutation = vi.fn(async () => undefined);
const templates = [
  {
    _id: "template-20",
    status: "active",
    name: "Twenty percent",
    defaultTerms: "Net 14",
    defaultNotes: "Template notes",
    defaultTaxRate: 0.1,
    defaultServiceChargePercent: 0.2,
    validityDays: 21,
    visibleSections: ["pricing_summary", "terms"],
  },
  {
    _id: "template-10",
    status: "active",
    name: "Ten percent",
    defaultTaxRate: 0.1,
    defaultServiceChargePercent: 0.1,
    visibleSections: ["pricing_summary"],
  },
  {
    _id: "template-free",
    status: "active",
    name: "No fee",
    defaultTaxRate: 0.1,
    defaultServiceChargePercent: null,
    visibleSections: [],
  },
];

vi.mock("convex/react", () => ({ useMutation: () => draftMutation }));
vi.mock("../src/lib/manifest-convex-react", () => ({
  useListProposalTemplate: () => templates,
}));
vi.mock("../src/features/clients/useCatalogDishes", () => ({
  useCatalogDishes: () => ({ loading: false, lines: [] }),
}));
vi.mock("react-router-dom", () => ({
  Link: ({ children }: any) => createElement("a", null, children),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

import { ProposalCreateForm } from "../src/features/clients/ProposalCreateForm";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(async () => {
  localStorage.clear();
  draftMutation.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(ProposalCreateForm, {
        open: true,
        fromEvent: undefined,
        clients: [
          { _id: "client-1", clientType: "company", companyName: "Client" },
        ],
        activeClients: [
          { _id: "client-1", clientType: "company", companyName: "Client" },
        ],
        busy: null,
        run: async (_key: string, work: () => Promise<void>) => work(),
        onFailure: vi.fn(),
        onNotice: vi.fn(),
        onClose: vi.fn(),
      } as any),
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function change(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(field),
    "value",
  )?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

async function pickTemplate(id: string) {
  const select = Array.from(container.querySelectorAll("select")).find((node) =>
    node.textContent?.includes("Twenty percent"),
  )!;
  await act(async () => change(select, id));
}

async function addFlatLine(amount: string) {
  const add = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Add line",
  )!;
  await act(async () => add.click());
  const rows = container.querySelectorAll("tbody tr");
  const row = rows[rows.length - 1];
  const inputs = row.querySelectorAll("input");
  await act(async () => {
    change(inputs[0], "Dinner");
    change(inputs[1], amount);
  });
}

const taxInput = () =>
  container.querySelector('input[name="taxAmount"]') as HTMLInputElement;

describe("ProposalCreateForm template state", () => {
  it("derives template tax when pricing is entered after template selection", async () => {
    await pickTemplate("template-20");
    await addFlatLine("1000");
    expect(taxInput().value).toBe("120");
  });

  it("keeps a manually overridden tax fixed while pricing changes", async () => {
    await pickTemplate("template-20");
    await act(async () => change(taxInput(), "77"));
    await addFlatLine("1000");
    expect(taxInput().value).toBe("77");
  });

  it("replaces only the template-owned fee and removes it for a fee-free template", async () => {
    await addFlatLine("1000");
    await pickTemplate("template-20");
    expect(taxInput().value).toBe("120");
    await pickTemplate("template-10");
    expect(taxInput().value).toBe("110");
    await pickTemplate("template-free");
    expect(taxInput().value).toBe("100");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("restores controlled proposal fields and template metadata from the saved draft", async () => {
    await act(async () => root.unmount());
    localStorage.setItem(
      "capsule:draft:proposal",
      JSON.stringify({
        savedAt: Date.now(),
        values: {
          guestCount: "25",
          taxAmount: "33",
          discountAmount: "5",
          notes: "Restored notes",
          terms: "Restored terms",
          expiresAt: "2026-10-01",
          proposalDraftState: JSON.stringify({
            lines: [],
            visibleSections: ["terms"],
            templateTaxRate: null,
            templateServiceLineKey: null,
          }),
        },
      }),
    );
    root = createRoot(container);
    await act(async () =>
      root.render(
        createElement(ProposalCreateForm, {
          open: true,
          fromEvent: undefined,
          clients: [],
          activeClients: [{ _id: "client-1" }],
          busy: null,
          run: async (_key: string, work: () => Promise<void>) => work(),
          onFailure: vi.fn(),
          onNotice: vi.fn(),
          onClose: vi.fn(),
        } as any),
      ),
    );
    await act(async () =>
      change(
        container.querySelector('input[name="guestCount"]') as HTMLInputElement,
        "99",
      ),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650));
    });
    const restore = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Restore",
    )!;
    await act(async () => restore.click());
    expect(
      (container.querySelector('textarea[name="notes"]') as HTMLTextAreaElement)
        .value,
    ).toBe("Restored notes");
    expect(
      (container.querySelector('textarea[name="terms"]') as HTMLTextAreaElement)
        .value,
    ).toBe("Restored terms");
    expect(taxInput().value).toBe("33");
    expect(
      (container.querySelector('input[name="guestCount"]') as HTMLInputElement)
        .value,
    ).toBe("25");
  });

  it("persists removal of a dynamic pricing row before remount and restore", async () => {
    await addFlatLine("1000");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650));
    });

    const remove = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Remove",
    )!;
    await act(async () => remove.click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650));
    });
    await act(async () => root.unmount());

    root = createRoot(container);
    await act(async () =>
      root.render(
        createElement(ProposalCreateForm, {
          open: true,
          fromEvent: undefined,
          clients: [],
          activeClients: [{ _id: "client-1" }],
          busy: null,
          run: async (_key: string, work: () => Promise<void>) => work(),
          onFailure: vi.fn(),
          onNotice: vi.fn(),
          onClose: vi.fn(),
        } as any),
      ),
    );
    const restore = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Restore",
    )!;
    await act(async () => restore.click());
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
  });
});
