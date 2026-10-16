// @vitest-environment jsdom
// Screen comments show Done only when their GitHub issue was finished, and the
// leftover-items bulk preview applies exactly the rows it lists.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { commentSendChip } from "../src/app/shell/ReviewerToolbarCommentRow";
import { BulkActionPreview } from "../src/features/admin/import/BulkActionPreview";

const base = { addressing: false, working: false, sent: true };

describe("screen comment chip", () => {
  it("says Done only for a finished GitHub issue", () => {
    expect(
      commentSendChip({ ...base, resolved: true, issueDone: true })?.label,
    ).toBe("Done");
    expect(
      commentSendChip({ ...base, resolved: true, issueDone: false })?.label,
    ).toBe("Closed by hand");
    expect(
      commentSendChip({ ...base, resolved: false, issueDone: false })?.label,
    ).toBe("Sent");
  });
});

describe("bulk preview", () => {
  it("applies exactly the listed ids", () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const onApply = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        createElement(BulkActionPreview, {
          action: "skip",
          items: [
            { id: "a", sourceId: "1", sourceName: "One", recordLabel: null },
            { id: "b", sourceId: "2", sourceName: "Two", recordLabel: null },
          ],
          busy: false,
          onApply,
          onCancel: () => {},
        }),
      );
    });
    const apply = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Skip 2",
    );
    act(() => apply?.click());
    expect(onApply).toHaveBeenCalledWith(["a", "b"]);
    act(() => root.unmount());
  });
});
