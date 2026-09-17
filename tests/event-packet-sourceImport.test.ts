import { describe, it, expect } from "vitest";
import fixture from "../src/lib/eventPacket/fixtures/liberty-mutual-6837.sources.sanitized.json";
import { recognizeSource } from "../src/lib/eventPacket/recognizeSource";
import {
  groupSources,
  type ExtractedSource,
} from "../src/lib/eventPacket/groupSources";
import { extractObservations } from "../src/lib/eventPacket/extractObservations";
const sources: ExtractedSource[] = fixture.documents.map((d) => {
  const rows =
    "rows" in d && d.rows
      ? d.rows.map((r) => r.cells.map((c) => c.text))
      : undefined;
  const pages = "pages" in d ? d.pages : undefined;
  const recognized = recognizeSource({
    text: pages?.map((p) => p.text).join("\n"),
    rows,
  });
  return {
    tenantId: "pilot",
    pages: pages ?? [],
    rows,
    artifact: {
      fingerprint: d.sanitizedContentSha256,
      name: d.id,
      mimeType: d.contentType,
      importedAt: "2026-09-15T00:00:00Z",
      ...recognized,
    },
  };
});
describe("source import", () => {
  it("recognizes all supplied content and groups one event with references separate", () => {
    expect(sources.every((s) => s.artifact.kind !== "unknown")).toBe(true);
    const g = groupSources(sources);
    expect(g.candidates).toHaveLength(1);
    expect(g.candidates[0].identity).toEqual({
      tenantId: "pilot",
      invoiceNumber: "6837",
      eventDate: "2026-09-17",
    });
    expect(g.candidates[0].sources).toHaveLength(6);
    expect(g.sharedReferences).toHaveLength(5);
    expect(g.ungrouped.map((s) => s.artifact.kind)).toContain("kitchen_shift");
  });
  it("preserves all cells, associations, repeated visits, recipes and units", () => {
    const c = groupSources(sources).candidates[0];
    const o = c.sources.flatMap((s) => extractObservations(s, c.identity));
    expect(
      o.filter((x) => /^packlist\..*\.quantity$/.test(x.fieldKey)),
    ).toHaveLength(8);
    expect(o).toContainEqual(
      expect.objectContaining({
        value: "Assorted Dessert Bars",
        evidence: [expect.objectContaining({ row: 23, cell: "2" })],
      }),
    );
    expect(
      o
        .filter(
          (x) =>
            x.fieldKey.startsWith("timeline.nlt.") &&
            x.fieldKey.endsWith(".time"),
        )
        .map((x) => x.value),
    ).toContain("15:10");
    expect(o).toContainEqual(
      expect.objectContaining({ value: "MAKE BECHAMEL ***" }),
    );
    expect(o).toContainEqual(
      expect.objectContaining({ value: 6.25, unit: "gallons" }),
    );
    expect(
      o.filter((x) => x.fieldKey === "serviceStyle").map((x) => x.value),
    ).toEqual(expect.arrayContaining(["Drop Off", "Bring Hot"]));
  });
  it("never matches invoice alone across dates/tenants or an ambiguous menu", () => {
    const worksheet = sources.find((s) => s.artifact.kind === "worksheet")!;
    const other = {
      ...worksheet,
      artifact: { ...worksheet.artifact, fingerprint: "b".repeat(64) },
      pages: worksheet.pages.map((p) => ({
        ...p,
        text: p.text.replaceAll("9/17/2026", "9/18/2026"),
      })),
    };
    expect(groupSources([worksheet, other]).candidates).toHaveLength(2);
    const tenant = { ...worksheet, tenantId: "other" };
    expect(groupSources([worksheet, tenant]).candidates).toHaveLength(2);
    const conflicting = {
      ...worksheet,
      artifact: { ...worksheet.artifact, fingerprint: "c".repeat(64) },
      pages: worksheet.pages.map((p) => ({
        ...p,
        text: p.text.replaceAll("6837", "9001"),
      })),
    };
    const menu = sources.find((s) => s.artifact.kind === "event_menu")!;
    expect(
      groupSources([worksheet, conflicting, menu]).identityReviews,
    ).toHaveLength(1);
  });
});
import { importSources, parseCsv } from "../src/lib/eventPacket/importSources";
it("imports actual bytes idempotently and accepts an injected page extractor", async () => {
  const bytes = new TextEncoder().encode("%PDF-test");
  const worksheet = sources.find((s) => s.artifact.kind === "worksheet")!;
  const first = await importSources(
    [{ name: "renamed.pdf", mimeType: "application/pdf", bytes }],
    {
      tenantId: "pilot",
      importedAt: "2026-09-15T00:00:00Z",
      extractPdfPages: async () => worksheet.pages,
    },
  );
  const second = await importSources(
    [{ name: "renamed.pdf", mimeType: "application/pdf", bytes }],
    {
      tenantId: "pilot",
      importedAt: "2026-09-16T00:00:00Z",
      existingArtifacts: first.sources.map((s) => s.artifact),
      extractPdfPages: async () => worksheet.pages,
    },
  );
  expect(first.candidates[0].observations).toEqual(
    second.candidates[0].observations,
  );
  expect(first.sources[0].artifact.fingerprint).not.toBe(
    worksheet.artifact.fingerprint,
  );
  expect(parseCsv('"a,b",,"quoted ""value"""\r\n"line\nbreak",two,')).toEqual([
    ["a,b", "", 'quoted "value"'],
    ["line\nbreak", "two", ""],
  ]);
});
it("scopes tracker evidence to the selected event row", () => {
  const worksheet = sources.find((s) => s.artifact.kind === "worksheet")!;
  const tracker = sources.find((s) => s.artifact.kind === "event_tracker")!;
  const mixed = {
    ...tracker,
    pages: [
      {
        page: 1,
        text: "EVENT # NLT SERVICE STYLE WAREHOUSE\n9/17 777710:00 AMOTHER EVENTCook Onsite\n9/17 68378:45 AMLIBERTY MUTUAL LUNCHBring Hot",
      },
    ],
  };
  const c = groupSources([worksheet, mixed]).candidates[0];
  const track = c.sources.find((s) => s.artifact.kind === "event_tracker")!;
  expect(track.pages[0].text).not.toContain("OTHER EVENT");
  expect(extractObservations(track, c.identity)).toEqual([
    expect.objectContaining({
      fieldKey: "serviceStyle",
      value: "Bring Hot",
      evidence: [expect.objectContaining({ page: 1, row: 3 })],
    }),
  ]);
});
it("rejects contradictory explicit invoice identities and does not use print date as event date", () => {
  const worksheet = sources.find((s) => s.artifact.kind === "worksheet")!;
  const ambiguous = {
    ...worksheet,
    pages: [
      {
        page: 1,
        text: "Event Worksheet\nInvoice #: 6837\nInvoice #: 9000\nEvent Date: 9/17/2026",
      },
    ],
  };
  expect(groupSources([ambiguous]).candidates).toHaveLength(0);
  expect(groupSources([ambiguous]).identityReviews).toHaveLength(1);
  const undated = {
    ...worksheet,
    pages: [
      {
        page: 1,
        text: "Event Worksheet\nInvoice #: 6837\nPrinted Date: 9/15/2026",
      },
    ],
  };
  expect(groupSources([undated]).candidates).toHaveLength(0);
});
it("recognizes CSV when a caller supplies empty PDF text and spaced BEO layout", () => {
  const csv = sources.find((s) => s.artifact.kind === "packlist_csv")!;
  expect(recognizeSource({ text: "", rows: csv.rows }).kind).toBe(
    "packlist_csv",
  );
  const beo = sources.find((s) => s.artifact.kind === "beo")!;
  const spaced = {
    ...beo,
    pages: beo.pages.map((p) => ({
      ...p,
      text: p.text
        .replace("9/17/20266837Invoice", "9/17/2026 6837 Invoice")
        .replace("200**", "200 **"),
    })),
  };
  const c = groupSources([spaced]).candidates[0];
  expect(c.identity.invoiceNumber).toBe("6837");
  expect(extractObservations(spaced)).toContainEqual(
    expect.objectContaining({ fieldKey: "guestCount", value: 200 }),
  );
});
it("preserves raw recorded timestamps without assigning a timezone", () => {
  const worksheet = sources.find((s) => s.artifact.kind === "worksheet")!;
  const beo = sources.find((s) => s.artifact.kind === "beo")!;
  expect(extractObservations(worksheet)).toContainEqual(
    expect.objectContaining({
      fieldKey: "source.recordedTime",
      value: "9/15/2026 9:31:00 AM",
    }),
  );
  expect(extractObservations(beo)).toContainEqual(
    expect.objectContaining({
      fieldKey: "source.recordedTime",
      value: "9/15/2026 01:33:42 PM",
    }),
  );
});
it("extracts a different event without relying on the pilot name or invoice", () => {
  const w = sources.find((s) => s.artifact.kind === "worksheet")!;
  const changed = {
    ...w,
    pages: w.pages.map((p) => ({
      ...p,
      text: p.text
        .replaceAll("6837", "9123")
        .replaceAll("9/17/2026", "11/20/2027")
        .replaceAll("Liberty Mutual Lunch", "Community Celebration")
        .replace("Guest Count: 200", "Guest Count: 75"),
    })),
  };
  const result = groupSources([changed]);
  expect(result.candidates[0].identity).toEqual({
    tenantId: "pilot",
    invoiceNumber: "9123",
    eventDate: "2027-11-20",
  });
  const observations = extractObservations(changed);
  expect(observations).toContainEqual(
    expect.objectContaining({ fieldKey: "guestCount", value: 75 }),
  );
  expect(observations).toContainEqual(
    expect.objectContaining({
      fieldKey: "eventTitle",
      value: "Community Celebration",
    }),
  );
});
it("requires exact labeled client/contact identity instead of generic overlapping words", () => {
  const w = sources.find((s) => s.artifact.kind === "worksheet")!;
  const candidate = {
    ...w,
    pages: [
      {
        page: 1,
        text: "Event Worksheet\nInvoice #: 100\nEvent Date: 9/17/2026\nContact: Alice Example\nAlphaCorp\nNotes: delivery corporate office",
      },
    ],
  };
  const m = sources.find((s) => s.artifact.kind === "event_menu")!;
  const unrelated = {
    ...m,
    pages: [
      {
        page: 1,
        text: "Event Menu\nPrepared for: Bob Other: UnrelatedBeta\nEvent Date: 9/17/2026\ndelivery corporate office\nDessert Bars",
      },
    ],
  };
  const g = groupSources([candidate, unrelated]);
  expect(g.candidates[0].sources).toHaveLength(1);
  expect(g.identityReviews).toHaveLength(1);
});
it("respects tracker years and reviews yearless rows ambiguous across years", () => {
  const w = sources.find((s) => s.artifact.kind === "worksheet")!;
  const older = {
    ...w,
    pages: w.pages.map((p) => ({
      ...p,
      text: p.text.replaceAll("9/17/2026", "9/17/2025"),
    })),
  };
  const tracker = sources.find((s) => s.artifact.kind === "event_tracker")!;
  const dated = {
    ...tracker,
    pages: [
      {
        page: 1,
        text: "9/17/2025 6837 8:45 AM Liberty Mutual Lunch Bring Hot",
      },
    ],
  };
  expect(groupSources([w, dated]).candidates[0].sources).toHaveLength(1);
  const g = groupSources([w, older, tracker]);
  expect(g.candidates.every((c) => c.sources.length === 1)).toBe(true);
  expect(g.identityReviews).toHaveLength(1);
});
it("uses event date labels and reviews contradictory event dates", () => {
  const w = sources.find((s) => s.artifact.kind === "worksheet")!;
  const reordered = {
    ...w,
    pages: [
      {
        page: 1,
        text: "Event Worksheet\nInvoice #: 6837\nLast Changed: 9/15/2026\nEvent Date: 9/17/2026",
      },
    ],
  };
  expect(groupSources([reordered]).candidates[0].identity.eventDate).toBe(
    "2026-09-17",
  );
  const conflict = {
    ...reordered,
    pages: [
      { page: 1, text: reordered.pages[0].text + "\nEvent Date: 9/18/2026" },
    ],
  };
  expect(groupSources([conflict]).identityReviews).toHaveLength(1);
  expect(groupSources([conflict]).candidates).toHaveLength(0);
});
it("gives repeated same-page observations stable distinct IDs", () => {
  const b = sources.find((s) => s.artifact.kind === "beo")!;
  const duplicate = {
    ...b,
    pages: [
      {
        page: 1,
        text: "Banquet Event Order\nEvent Date: 9/17/2026\nInvoice #: 6837\n- 200 Serving Dessert Bars\n- 300 Serving Dessert Bars",
      },
    ],
  };
  const a = extractObservations(duplicate);
  expect(new Set(a.map((o) => o.id)).size).toBe(a.length);
  expect(extractObservations(duplicate)).toEqual(a);
});
it("checks every candidate identity source before associating an invoice-free menu", () => {
  const w = sources.find((s) => s.artifact.kind === "worksheet")!,
    b = sources.find((s) => s.artifact.kind === "beo")!,
    m = sources.find((s) => s.artifact.kind === "event_menu")!;
  const worksheet = {
    ...w,
    pages: [
      {
        page: 1,
        text: "Event Worksheet\nInvoice #: 100\nEvent Date: 9/17/2026\nContact: Alice\nAlphaCorp",
      },
    ],
  };
  const beo = {
    ...b,
    pages: [
      {
        page: 1,
        text: "Banquet Event Order\nInvoice #: 100\nEvent Date: 9/17/2026\nAlphaCorpCompany:",
      },
    ],
  };
  const menu = {
    ...m,
    pages: [
      {
        page: 1,
        text: "Event Menu\nPrepared for: Bob: AlphaCorp\nEvent Date: 9/17/2026",
      },
    ],
  };
  const g = groupSources([worksheet, beo, menu]);
  expect(g.candidates[0].sources).toHaveLength(2);
  expect(g.identityReviews).toHaveLength(1);
});
it("does not mistake a date year preceding a forward invoice label for an invoice", () => {
  const w = sources.find((s) => s.artifact.kind === "worksheet")!;
  const source = {
    ...w,
    pages: [
      {
        page: 1,
        text: "Event Worksheet\nEvent Date: 9/17/2026\nInvoice #: 6837",
      },
    ],
  };
  expect(groupSources([source]).candidates[0]?.identity.invoiceNumber).toBe(
    "6837",
  );
});
it("extracts title and client from the BEO header without using the following guest row", () => {
  const b = sources.find((s) => s.artifact.kind === "beo")!;
  const o = extractObservations(b);
  expect(
    o.filter((x) => x.fieldKey === "eventTitle").map((x) => x.value),
  ).toEqual(["Liberty Mutual Lunch"]);
  expect(
    o.filter((x) => x.fieldKey === "clientName").map((x) => x.value),
  ).toEqual(["Liberty Mutual Insurance"]);
  const w = sources.find((s) => s.artifact.kind === "worksheet")!;
  expect(extractObservations(w)).toContainEqual(
    expect.objectContaining({
      fieldKey: "venue.name",
      value: "Liberty Mutual",
    }),
  );
});
it("keeps CSV contact separate from client and never treats menu vendor email as client email", () => {
  const csv = sources.find((s) => s.artifact.kind === "packlist_csv")!,
    menu = sources.find((s) => s.artifact.kind === "event_menu")!;
  expect(extractObservations(csv)).toContainEqual(
    expect.objectContaining({
      fieldKey: "contact.name",
      value: "[REDACTED PERSON]",
    }),
  );
  expect(extractObservations(csv)).toContainEqual(
    expect.objectContaining({
      fieldKey: "clientName",
      value: "Liberty Mutual Insurance",
    }),
  );
  expect(
    extractObservations(menu).filter((o) => o.fieldKey.startsWith("contact.")),
  ).toEqual([]);
});
it("uses the same reverse BEO contact block for grouping and observations", () => {
  const w = sources.find((s) => s.artifact.kind === "worksheet")!,
    b = sources.find((s) => s.artifact.kind === "beo")!,
    m = sources.find((s) => s.artifact.kind === "event_menu")!;
  const worksheet = {
    ...w,
    pages: [
      {
        page: 1,
        text: "Event Worksheet\nInvoice #: 100\nEvent Date: 9/17/2026\nContact: Alice\nAlphaCorp",
      },
    ],
  };
  const beo = {
    ...b,
    pages: [
      {
        page: 1,
        text: "Banquet Event Order\nInvoice #: 100\nEvent Date: 9/17/2026\nLocation:\nBob\nCell: 555-0100\nContact:\nAlphaCorpCompany:",
      },
    ],
  };
  const menu = {
    ...m,
    pages: [
      {
        page: 1,
        text: "Event Menu\nPrepared for: Alice: AlphaCorp\nEvent Date: 9/17/2026",
      },
    ],
  };
  expect(extractObservations(beo)).toContainEqual(
    expect.objectContaining({ fieldKey: "contact.name", value: "Bob" }),
  );
  const g = groupSources([worksheet, beo, menu]);
  expect(g.candidates[0].sources).toHaveLength(2);
  expect(g.identityReviews).toHaveLength(1);
});
