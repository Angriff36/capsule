/**
 * Runtime proof (AC-274, PL-SOURCE-DATASETS): the executed event mapping
 * covers exactly the 27 documented columns of TPP's event export
 * (work/tpp-capsule-data-map.md section 1) and preserves the literal Event
 * Status. Each column either fills a field or stays with the row on the import
 * link; the export's bare status codes (3, 9, 0, 1, 00) mean what the data map
 * says (Final, Cancelled, Quote, Confirmed, Closed), so finished old events
 * come in finished or cancelled, and the code is kept word for word.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { sourceRowsFromGrid } from "../../src/lib/importSourceFile";
import { TPP_EVENT_LIST_COLUMNS } from "../../src/lib/tppEventListColumns";
import { parseCsv } from "../../src/lib/tppMenuCsv";
import { oldStatusWithWord } from "../../convex/lib/oldSystemEventStage";
import {
  ensureEncryptionKey,
  importRows,
  links,
  ownerOf,
  tableRows,
} from "./source-identity.runtime.helpers";

beforeAll(ensureEncryptionKey);

const grid = parseCsv(
  readFileSync(
    new URL(
      "../fixtures/tpp-reports/event-list-27-columns-sample.csv",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("runtime proof: the 27-column TPP event export", () => {
  it("every documented column fills its field or is kept on the import", () => {
    const columns = Object.keys(TPP_EVENT_LIST_COLUMNS);
    expect(columns).toHaveLength(27);
    expect(grid[0]).toEqual(columns);

    const read = sourceRowsFromGrid(grid, "events");
    const filled = Object.fromEntries(
      Object.entries(TPP_EVENT_LIST_COLUMNS).flatMap(([column, home]) =>
        "field" in home ? [[column, home.field]] : [],
      ),
    );
    expect(
      Object.fromEntries(read.matched.map((m) => [m.heading, m.field])),
    ).toEqual(filled);
    expect(read.keptAsWritten.sort()).toEqual(
      columns.filter((c) => !(c in filled)).sort(),
    );
    for (const [column, home] of Object.entries(TPP_EVENT_LIST_COLUMNS))
      if ("kept" in home) expect(home.kept.length, column).toBeGreaterThan(10);
  });

  it("status codes map as the data map says and the code is kept word for word", async () => {
    const tenantId = "tenant-event-mapping-parity";
    const actor = ownerOf(tenantId);
    await importRows(actor, "contacts", [
      { ContactID: "Q1", FirstName: "Mara", LastName: "Quill" },
    ]);

    const rows = sourceRowsFromGrid(grid, "events").rows;
    const result = await importRows(actor, "events", rows);
    expect(result).toMatchObject({ committed: 5, pending: 0 });

    const events = await tableRows(actor, "events", tenantId);
    const byTitle = (title: string) => events.find((e) => e.title === title);
    expect(byTitle("Quill Wedding")).toMatchObject({
      stage: "completed",
      expectedHeadcount: 30,
    });
    expect(byTitle("Quill Lunch")).toMatchObject({ stage: "completed" });
    expect(byTitle("Quill Retreat")).toMatchObject({
      stage: "cancelled",
      cancellationReason: "Cancelled in the old system",
    });
    expect(byTitle("Quill Graduation")).toMatchObject({
      stage: "cancelled",
      cancellationReason: "Quote not booked in the old system before its date",
    });
    expect(byTitle("Quill Anniversary")).toMatchObject({ stage: "planning" });

    const wedding = (await links(actor, tenantId)).find(
      (l) => l.recordType === "event" && l.externalId === "9201",
    );
    const raw = JSON.parse(String(wedding?.rawSourceData)) as {
      rawEventStatus: string;
      sourceRow: Record<string, string>;
    };
    expect(raw.rawEventStatus).toBe("3");
    expect(raw.sourceRow).toMatchObject({
      EventStatus: "3",
      "Event Status Name": "3- Final",
      "Balance Due": "125.50",
      "Event Gratuity": "150.00",
      "Event Service Charge": "80.00",
      "Event SubTotal": "1525.36",
      "Service Style Category": "Drop Off",
    });
    expect(oldStatusWithWord(raw.rawEventStatus)).toBe("3 (Final)");
    expect(oldStatusWithWord("3- Final")).toBe("3- Final");
  });
});
