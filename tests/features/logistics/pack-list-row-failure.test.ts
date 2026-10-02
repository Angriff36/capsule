// @vitest-environment jsdom
import { createElement } from "react";
import { Route, Routes } from "react-router-dom";
import { expect, it } from "vitest";
import {
  backend,
  button,
  click,
  command,
  container,
  mount,
} from "../../support/mounted-app";
import { PackListDetailPage } from "../../../src/features/logistics/PackListDetailPage";

// The page only reads ids shaped like a real record id.
const LIST = "kd7cf1t17pmj822wqhm65j6sb18f9et8";

function page() {
  return createElement(
    Routes,
    null,
    createElement(Route, {
      path: "/logistics/packs/:id",
      element: createElement(PackListDetailPage),
    }),
  );
}

it("a failed row action shows its own plain error and a Try again that reruns it in place (AC-048, #142)", async () => {
  backend.values.set("useGetPackList", {
    _id: LIST,
    eventId: "event-a",
    status: "draft",
    version: 1,
    name: "Smith wedding pack",
  });
  backend.values.set("useListPackListItem", [
    {
      _id: "item-cutter",
      packListId: LIST,
      description: "Cake cutter",
      requiredQuantity: 1,
      packedQuantity: 0,
      unit: "each",
      status: "listed",
      version: 1,
    },
  ]);
  const startPacking = command("usePackListStartPacking", { version: 2 });
  const markMissing = command("usePackListItemMarkMissing", { version: 2 });
  markMissing.mockRejectedValueOnce(new Error("Network connection lost"));
  await mount(page(), `/logistics/packs/${LIST}`);

  // Marking an item on a draft list starts packing first (#142): no raw
  // server error about the list state.
  await click(button("Mark missing"));
  expect(startPacking).toHaveBeenCalledWith({ docId: LIST, version: 1 });
  expect(markMissing).toHaveBeenCalledTimes(1);

  // The failure is on the row, in plain words, and the row stays in the list.
  const alert = container.querySelector<HTMLElement>('td [role="alert"]')!;
  expect(alert).not.toBeNull();
  expect(alert.closest("tr")?.textContent).toContain("Cake cutter");
  expect(alert.textContent).not.toMatch(/Uncaught|Server Error|stack/i);

  // Try again reruns the same action on the same row; nothing is re-added.
  await click(button("Try again", alert));
  expect(markMissing).toHaveBeenCalledTimes(2);
  expect(markMissing).toHaveBeenLastCalledWith({
    docId: "item-cutter",
    version: 1,
  });
  expect(container.querySelector('td [role="alert"]')).toBeNull();
  expect(container.textContent).toContain("Item marked missing.");
});
