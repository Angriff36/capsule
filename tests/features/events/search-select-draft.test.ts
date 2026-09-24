/**
 * @vitest-environment jsdom
 */
import { createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { SearchSelect } from "../../../src/ui/SearchSelect";
import { useFormDraft } from "../../../src/ui/formDraft";

const DRAFT_KEY = "capsule:draft:search-select-proof";

function EventDraftHarness() {
  const draft = useFormDraft("search-select-proof");
  const [clientId, setClientId] = useState("");
  return createElement(
    "div",
    null,
    createElement(
      "form",
      { id: "event-create-form", ref: draft.formRef },
      createElement("input", { name: "title", defaultValue: "" }),
    ),
    createElement(
      "aside",
      null,
      createElement(SearchSelect, {
        name: "clientId",
        form: "event-create-form",
        value: clientId,
        onChange: setClientId,
        options: [
          {
            id: "client-kamini",
            label: "Kamini Singh",
            hint: "kamini@example.com",
          },
        ],
        testId: "event-create-client",
      }),
    ),
  );
}

function readDraft(): { values?: Record<string, string> } {
  return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") as {
    values?: Record<string, string>;
  };
}

async function settleDraft() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 700));
  });
}

describe("search select draft", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    localStorage.removeItem(DRAFT_KEY);
  });

  it("keeps the chosen account after the search keystrokes have already been saved", async () => {
    localStorage.removeItem(DRAFT_KEY);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(EventDraftHarness));
    });

    const title = container.querySelector(
      "input[name=title]",
    ) as HTMLInputElement;
    await act(async () => {
      title.value = "Ewing Wedding";
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settleDraft();
    expect(readDraft().values?.title).toBe("Ewing Wedding");
    expect(readDraft().values?.clientId).toBeUndefined();

    const input = container.querySelector(
      "[data-testid=event-create-client]",
    ) as HTMLInputElement;
    await act(async () => {
      input.focus();
    });

    const option = container.querySelector("[role=option]");
    expect(option).not.toBeNull();
    await act(async () => {
      option?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    await settleDraft();
    expect(readDraft().values?.clientId).toBe("client-kamini");
  });
});
