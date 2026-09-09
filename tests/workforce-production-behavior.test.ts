// @vitest-environment jsdom
import { createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  container,
  mount,
  command,
  input,
  button,
  click,
} from "./support/mounted-app";
import { TimeSheetPage } from "../src/features/workforce/TimeSheetPage";
import { PrepBoardPage } from "../src/features/production/PrepBoardPage";

it("renders absent and real break durations in the actual time ledger", async () => {
  backend.values.set("useListPerson", [
    { _id: "person-a", givenName: "Ada", familyName: "Cook" },
  ]);
  backend.values.set(
    "useListTimeRecord",
    [null, 0, 30].map((breakMinutes, index) => ({
      _id: `time-${index}`,
      personId: "person-a",
      status: "closed",
      version: 2,
      clockInAt: Date.UTC(2026, 8, 8, 9),
      clockOutAt: Date.UTC(2026, 8, 8, 14),
      breakMinutes,
    })),
  );
  await mount(createElement(TimeSheetPage));
  const table = [...container.querySelectorAll("table")].find((table) =>
    table.textContent?.includes("Break"),
  );
  expect(table).toBeDefined();
  const breakIndex = [...table!.querySelectorAll("thead th")].findIndex(
    (cell) => cell.textContent === "Break",
  );
  expect(breakIndex).toBeGreaterThanOrEqual(0);
  expect(
    [...table!.querySelectorAll("tbody tr")].map(
      (row) => row.querySelectorAll("td")[breakIndex]?.textContent,
    ),
  ).toEqual(["—", "—", "30 min"]);
});
it("collects a prep block reason in the page and submits it only after confirmation", async () => {
  backend.values.set("useListPrepTask", [
    {
      _id: "task-a",
      name: "Roast carrots",
      eventId: "event-a",
      status: "in_progress",
      version: 4,
      quantity: 10,
      unit: "pound",
      station: "hot",
      scheduledAt: 1,
    },
  ]);
  const block = command("usePrepTaskMarkBlocked");
  await mount(createElement(PrepBoardPage));
  await click(button("Block"));
  expect(block).not.toHaveBeenCalled();
  expect(button("Block task").disabled).toBe(true);
  input("reason", " Waiting for the oven ");
  await click(button("Keep task"));
  expect(block).not.toHaveBeenCalled();
  await click(button("Block"));
  input("reason", " Waiting for the oven ");
  await click(button("Block task"));
  expect(block).toHaveBeenCalledExactlyOnceWith({
    docId: "task-a",
    version: 4,
    reason: "Waiting for the oven",
  });
  expect(container.textContent).toContain(
    "Prep task blocked with a reason for the team.",
  );
});
