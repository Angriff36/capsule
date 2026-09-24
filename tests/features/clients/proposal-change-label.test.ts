/**
 * @vitest-environment jsdom
 */
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { ProposalChangeLabel } from "../../../src/features/clients/ProposalChangeLabel";

const LINE = "Change of the accepted proposal";

describe("proposal change label", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
  });

  async function render(replacesProposalId?: string | null) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(ProposalChangeLabel, { replacesProposalId }));
    });
  }

  it("names a draft that was opened from an accepted proposal", async () => {
    await render("proposal-accepted");
    expect(container?.textContent).toBe(LINE);
  });

  it("stays quiet on an ordinary proposal", async () => {
    await render(null);
    expect(container?.textContent).toBe("");
    await act(async () => {
      root?.render(createElement(ProposalChangeLabel, {}));
    });
    expect(container?.textContent).toBe("");
  });
});
