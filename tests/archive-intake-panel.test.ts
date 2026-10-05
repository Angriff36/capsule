// @vitest-environment jsdom
import { act, createElement } from "react";
import { Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import {
  backend,
  button,
  click,
  command,
  container,
  field,
  input,
  mount,
} from "./support/mounted-app";
import { ImportRunDetailPage } from "../src/features/admin/import/ImportRunDetailPage";

// PL-ARCHIVE: the ordinary import page runs every archive stage — upload,
// list with the old system's report list, sort + count, provenance — and
// shows each file's outcome in plain words, including files that did not
// become records.

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
const baseRun = {
  _id: runId,
  sourceSystem: "tpp_legacy",
  datasetType: "events",
  recordCounts: "{}",
  version: 2,
};

function pickFile(name: string) {
  const element = field(name) as HTMLInputElement;
  const file = new File([new Uint8Array([80, 75, 5, 6])], "reports.zip", {
    type: "application/zip",
  });
  Object.defineProperty(element, "files", {
    configurable: true,
    value: [file],
  });
  act(() => {
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  return file;
}

it("uploads an archive, reads it against the report list, and sorts every file", async () => {
  backend.values.set("useGetImportRun", { ...baseRun, status: "started" });
  backend.values.set("queries:listImportArtifactByImportRunId", []);
  command("fileStorage:generateUploadUrl", "https://upload.example/abc");
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ storageId: "kg2storage" }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  const inventory = command("archiveInventory:inventoryArchive", {
    status: "registered",
    registered: 2,
    skipped: 0,
    repaired: 0,
    workbooks: [
      { name: "beo-1.xlsx", checksum: "a", byteSize: 1, entryCount: 3 },
      { name: "extra.xlsx", checksum: "b", byteSize: 1, entryCount: 3 },
    ],
    reconciliation: {
      archiveWorkbookCount: 2,
      indexWorkbookCount: 2,
      inBoth: 1,
      archiveOnly: ["extra.xlsx"],
      indexOnly: ["missing.xlsx"],
    },
  });
  const classify = command("archiveDisposition:classifyArchiveWorkbooks", {
    classified: 2,
    skipped: 0,
    dispositionCounts: { normalized: 1, unsupported: 1 },
    unaccountedRecordCount: 0,
  });
  const provenance = command("archiveProvenance:recordArchiveProvenance", {
    recorded: 2,
    skipped: 0,
  });

  await mount(page(), `/admin/imports/${runId}`);
  const file = pickFile("archiveFile");
  input("indexNames", "beo-1.xlsx\n\nmissing.xlsx\nbeo-1.xlsx");
  await click(button("Read archive"));

  expect(fetchMock).toHaveBeenCalledWith("https://upload.example/abc", {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: file,
  });
  expect(inventory).toHaveBeenCalledWith({
    importRunId: runId,
    storageId: "kg2storage",
    indexReportNames: ["beo-1.xlsx", "missing.xlsx"],
  });
  expect(classify).toHaveBeenCalledWith({ importRunId: runId });
  expect(provenance).toHaveBeenCalledWith({ importRunId: runId });
  expect(container.textContent).toContain(
    "Found 2 file(s) in the archive. Every file is accounted for.",
  );
});

it("a byte-identical archive names the earlier import and adds nothing", async () => {
  backend.values.set("useGetImportRun", { ...baseRun, status: "started" });
  backend.values.set("queries:listImportArtifactByImportRunId", []);
  command("fileStorage:generateUploadUrl", "https://upload.example/abc");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ storageId: "kg2storage" }),
    })),
  );
  command("archiveInventory:inventoryArchive", {
    status: "duplicate",
    priorImportRunId: "priorrun123",
  });
  const classify = command("archiveDisposition:classifyArchiveWorkbooks", {});

  await mount(page(), `/admin/imports/${runId}`);
  pickFile("archiveFile");
  await click(button("Read archive"));

  expect(classify).not.toHaveBeenCalled();
  expect(container.textContent).toContain(
    "These exact files were already brought in by an earlier import. Nothing new was added.",
  );
  const link = [...container.querySelectorAll("a")].find(
    (a) => a.textContent === "an earlier import",
  );
  expect(link?.getAttribute("href")).toBe("/admin/imports/priorrun123");
});

it("lists every file in plain words, shows the report-list gap, and keeps a file as reference", async () => {
  backend.values.set("useGetImportRun", {
    ...baseRun,
    status: "reviewing",
    archiveStorageId: "kg2storage",
    archiveWorkbookCount: 3,
    indexWorkbookCount: 2,
    indexNameMismatch: true,
    discrepancyExplained: false,
    unaccountedRecordCount: 0,
  });
  const evidence = {
    byteSize: 10,
    entryCount: 3,
    parseStatus: "parsed",
    checksum: null,
  };
  backend.values.set("queries:listImportArtifactByImportRunId", [
    {
      ...evidence,
      _id: "f1",
      name: "beo-1.xlsx",
      version: 3,
      disposition: "normalized",
      totalRowCount: 7,
      rowOutcomeCounts: JSON.stringify({
        header: 3,
        normalized: 3,
        summary: 1,
      }),
      provenance: JSON.stringify({ indexed: "in_both" }),
    },
    {
      ...evidence,
      _id: "f2",
      name: "copy.xlsx",
      version: 3,
      disposition: "duplicate_view",
      totalRowCount: 2,
      rowOutcomeCounts: JSON.stringify({ normalized: 2 }),
      provenance: JSON.stringify({ indexed: "in_both" }),
    },
    {
      ...evidence,
      _id: "f3",
      name: "venues.xlsx",
      version: 4,
      disposition: "unsupported",
      totalRowCount: 2,
      rowOutcomeCounts: JSON.stringify({ unsupported: 2 }),
      provenance: JSON.stringify({ indexed: "archive_only" }),
    },
  ]);
  const relabel = command("useImportArtifactClassify", {});
  const classify = command("archiveDisposition:classifyArchiveWorkbooks", {
    unaccountedRecordCount: 0,
  });

  await mount(page(), `/admin/imports/${runId}`);
  const panel = container.querySelector('[data-testid="archive-intake-panel"]');
  const text = panel?.textContent ?? "";
  expect(text).toContain(
    "3 file(s) in the archive. Every file is accounted for.",
  );
  expect(text).toContain(
    "Accounted for does not mean every row became a Capsule record.",
  );
  expect(text).toContain(
    "The archive has 3 file(s); the report list names 2. Not in the list: venues.xlsx.",
  );
  expect(text).toContain("Readable — its rows can come into Capsule");
  expect(text).toContain("7 rows: readable 3, headings 3, footers 1");
  expect(text).toContain("Same data as another file here — no new records");
  expect(text).toContain(
    "Capsule can't read this kind of report — kept on file",
  );
  expect(button("Explain the difference")).toBeTruthy();
  expect(panel?.querySelector('[name="archiveFile"]')).toBeNull();

  await click(button("Keep as reference"));
  expect(relabel).toHaveBeenCalledWith({
    docId: "f3",
    version: 4,
    disposition: "linked_reference",
  });
  expect(classify).toHaveBeenCalledWith({ importRunId: runId });
  expect(container.textContent).toContain("venues.xlsx is kept as reference.");
});
