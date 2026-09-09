// @vitest-environment jsdom
import { createElement } from "react";
import { Route, Routes } from "react-router-dom";
import { expect, it } from "vitest";
import { backend, container, mount } from "./support/mounted-app";
import { ImportRunDetailPage } from "../src/features/admin/import/ImportRunDetailPage";

const runId = "nn7ez3fz56ya246m6p17az2ad58crnwg";
function page() {
  return createElement(
    Routes,
    null,
    createElement(Route, {
      path: "/admin/imports/:id",
      element: createElement(ImportRunDetailPage),
    }),
  );
}
it("renders source coordinates and raw/normalized evidence separately on the actual import detail page", async () => {
  backend.values.set("useGetImportRun", {
    _id: runId,
    status: "reviewing",
    sourceSystem: "tpp_legacy",
    datasetType: "events",
    recordCounts: "{}",
    version: 3,
  });
  const base = {
    disposition: "normalized",
    parseStatus: "parsed",
    checksum: "abcdef1234567890",
    byteSize: 2048,
    entryCount: 1,
  };
  backend.values.set("queries:listImportArtifactByImportRunId", [
    {
      ...base,
      _id: "a",
      name: "A.xlsx",
      provenance: JSON.stringify({
        workbook: {
          parserVersion: "parser-3",
          dateSystem: "1904",
          timezoneAssumption: "UTC",
          macros: "absent",
          cellsTruncated: true,
          mergedRangesTruncated: true,
          cellCap: 100,
          cellCount: 120,
          byteBudget: 2048,
          sheets: [
            {
              name: "Events",
              mergedRanges: ["A1:B1"],
              cells: [
                {
                  ref: "C7",
                  raw: "45123",
                  value: "2027-07-17",
                  outcome: "date",
                  unit: null,
                },
              ],
            },
          ],
        },
      }),
    },
    { ...base, _id: "b", name: "B.xlsx", provenance: "{}" },
    {
      ...base,
      _id: "c",
      name: "C.xlsx",
      provenance: JSON.stringify({ workbook: { error: "Invalid ZIP" } }),
    },
  ]);
  await mount(page(), `/admin/imports/${runId}`);
  expect(backend.reads).toHaveBeenCalledWith(
    "queries:listImportArtifactByImportRunId",
    { importRunId: runId },
  );
  const panel = container.querySelector(
    '[data-testid="import-provenance-panel"]',
  )!;
  expect(
    [...panel.querySelectorAll("thead th")].map((node) => node.textContent),
  ).toEqual(["Coordinate", "Raw value", "Normalized value", "Outcome", "Unit"]);
  expect(
    [...panel.querySelectorAll("tbody td")].map((node) => node.textContent),
  ).toEqual(["Events!C7", "45123", "2027-07-17", "date", "—"]);
  for (const text of [
    "parser-3",
    "date system 1904",
    "UTC",
    "abcdef123456",
    "2,048 bytes",
    "Provenance not recorded yet",
    "Workbook unreadable: Invalid ZIP",
    "100 cells / 2 KiB",
    "120 cells",
    "Some merged ranges are omitted",
  ])
    expect(panel.textContent).toContain(text);
});

it("shows each disposition count and warns about unaccounted workbooks without claiming they were imported", async () => {
  const run = {
    _id: runId,
    status: "reviewing",
    sourceSystem: "tpp_legacy",
    datasetType: "events",
    recordCounts: "{}",
    version: 3,
    dispositionCounts: JSON.stringify({
      normalized: 11,
      linked_reference: 12,
      duplicate_view: 13,
      needs_mapping: 14,
      unsupported: 15,
      invalid: 16,
    }),
    unaccountedRecordCount: 7,
  };
  backend.values.set("useGetImportRun", run);
  await mount(page(), `/admin/imports/${runId}`);
  const heading = [...container.querySelectorAll("h2")].find((node) =>
    node.textContent?.includes("Workbook Dispositions"),
  )!;
  const card = heading.closest(".card")!;
  for (const [label, count] of [
    ["Normalized", 11],
    ["Linked reference", 12],
    ["Duplicate view", 13],
    ["Needs mapping", 14],
    ["Unsupported", 15],
    ["Invalid", 16],
  ]) {
    const labelNode = [...card.querySelectorAll("*")].find(
      (node) => node.childElementCount === 0 && node.textContent === label,
    )!;
    expect(labelNode.parentElement?.textContent).toContain(String(count));
  }
  expect(card.textContent).toContain("7 unaccounted");
  expect(card.textContent).toContain("Commit stays closed");
  expect(card.textContent).toContain(
    "Dispositions describe the source archive",
  );
  backend.values.set("useGetImportRun", {
    ...run,
    dispositionCounts: "{}",
    archiveWorkbookCount: 7,
  });
  await mount(page());
  expect(container.textContent).toContain("workbooks are not classified yet");
});
