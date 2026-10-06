import { expect, it } from "vitest";
import {
  analyzePackagePatterns,
  type InventoryLine,
  type PlanEvent,
} from "../src/lib/tppPackagePatterns";
const events: PlanEvent[] = Array.from({ length: 23 }, (_, id) => ({
  id,
  date: "2025-06-01",
}));
const line = (
  event: number,
  id: string,
  item: string,
  classification: string,
  quantity = 1,
): InventoryLine => ({
  event,
  id,
  quantity,
  inventoryItem: { id: item, name: item, classification },
});

it("distinguishes a repeated package component from equipment common to every event and normalizes package quantity", () => {
  const rows = events.map((e) =>
    line(Number(e.id), `common-${e.id}`, "standard-kit", "E"),
  );
  for (let i = 0; i < 3; i++)
    rows.push(
      line(i, `package-${i}`, "P", "EP", 2),
      line(i, `oven-${i}`, "oven", "E", 4),
    );
  rows.push(rows.at(-1)!);
  const report = analyzePackagePatterns(events, rows, "2026-09-28"),
    p = report.packages[0];
  expect(p.naiveThreeOccurrenceMembers).toBe(2);
  expect(p.candidates.find((c) => c.id === "oven")).toMatchObject({
    classification: "proposed_core",
    support: 3,
    quantityPerPackage: 2,
  });
  expect(p.candidates.find((c) => c.id === "standard-kit")).toMatchObject({
    classification: "optional",
    backgroundRate: 1,
  });
  expect(report.duplicateRows).toBe(1);
});

it("does not assign shared equipment to two packages that always occur together", () => {
  const rows: InventoryLine[] = [];
  for (let i = 0; i < 3; i++)
    rows.push(
      line(i, `p-${i}`, "P", "EP"),
      line(i, `q-${i}`, "Q", "BP"),
      line(i, `oven-${i}`, "oven", "E"),
    );
  const result = analyzePackagePatterns(events, rows, "2026-09-28");
  expect(result.packages.map((p) => p.proposedCoreMembers)).toEqual([0, 0]);
  expect(result.packages[0].candidates[0]).toMatchObject({
    support: 3,
    soloSupport: 0,
    classification: "optional",
  });
});

it("counts independent events, rejects cancelled evidence, and leaves inconsistent quantities unresolved", () => {
  const rows: InventoryLine[] = [];
  for (let i = 0; i < 3; i++)
    rows.push(
      line(i, `p-${i}`, "P", "EP"),
      line(i, `chairs-${i}`, "chairs", "E", i + 1),
    );
  rows.push(
    line(0, "extra-1", "one-event-only", "E"),
    line(0, "extra-2", "one-event-only", "E"),
    line(0, "extra-3", "one-event-only", "E"),
  );
  rows.push(
    line(99, "cancel-p", "P", "EP"),
    line(99, "cancel-chair", "chairs", "E", 2),
  );
  const result = analyzePackagePatterns(
    [
      ...events,
      { id: 99, date: "2025-06-01", statusModel: { isCancelled: true } },
    ],
    rows,
    "2026-09-28",
  ).packages[0];
  expect(result.eligibleEvents).toBe(3);
  expect(
    result.candidates.find((c) => c.id === "one-event-only"),
  ).toMatchObject({ support: 1, classification: "insufficient_evidence" });
  expect(result.candidates.find((c) => c.id === "chairs")).toMatchObject({
    classification: "likely_member_variable_quantity",
    quantityPerPackage: null,
  });
});

it("uses the latest twenty finished events while retaining older variants as optional", () => {
  const cohort: PlanEvent[] = [],
    rows: InventoryLine[] = [];
  for (let i = 1; i <= 30; i++) {
    cohort.push({ id: i, date: `2025-06-${String(i).padStart(2, "0")}` });
    cohort.push({ id: 100 + i, date: `2025-06-${String(i).padStart(2, "0")}` });
    rows.push(
      line(i, `p-${i}`, "P", "EP"),
      line(i, `e-${i}`, i <= 10 ? "old-oven" : "new-oven", "E"),
    );
  }
  for (const [id, date, statusModel] of [
    [90, "2027-01-01", {}],
    [91, "2025-07-01", { isProposal: true }],
    [92, "2026-09-28", {}],
  ] as const) {
    cohort.push({ id, date, statusModel });
    rows.push(line(id, `p-${id}`, "P", "EP"));
  }
  const p = analyzePackagePatterns(cohort, rows, "2026-09-28").packages[0];
  expect(p).toMatchObject({ eligibleEvents: 20, historicalEvents: 30 });
  expect(p.candidates.find((c) => c.id === "new-oven")).toMatchObject({
    support: 20,
    classification: "proposed_core",
  });
  expect(p.candidates.find((c) => c.id === "old-oven")).toMatchObject({
    support: 0,
    historicalSupport: 10,
    classification: "optional",
  });
});

it("fits per-event, per-package and per-guest amounts independently and requires ninety percent agreement", () => {
  const cohort = Array.from({ length: 30 }, (_, id) => ({
    id,
    date: "2025-06-01",
    guestCount: 25 * (id + 1),
  }));
  const rows: InventoryLine[] = [];
  for (let i = 0; i < 10; i++) {
    rows.push(
      line(i, `p-${i}`, "P", "EP", i + 1),
      line(i, `fixed-${i}`, "fixed", "E", 1),
      line(i, `scaled-${i}`, "scaled", "E", 2 * (i + 1)),
      line(i, `guest-${i}`, "guest", "E", i + 1),
      line(i, `ninety-${i}`, "ninety", "E", i < 9 ? 1 : 17),
      line(i, `variable-${i}`, "variable", "E", i < 8 ? 1 : 17),
    );
  }
  // Vary package quantities independently of guests, so guest count wins for
  // guest equipment and package count wins for package equipment.
  for (let i = 0; i < 10; i++) {
    const qty = (i % 2) + 1;
    rows.find((r) => r.id === `p-${i}`)!.quantity = qty;
    rows.find((r) => r.id === `scaled-${i}`)!.quantity = qty * 2;
  }
  const c = analyzePackagePatterns(cohort, rows, "2026-09-28").packages[0]
    .candidates;
  expect(c.find((x) => x.id === "fixed")?.quantityRule).toMatchObject({
    scale: "fixed",
    quantity: 1,
  });
  expect(c.find((x) => x.id === "scaled")?.quantityRule).toMatchObject({
    scale: "packages",
    quantity: 2,
    perUnits: 1,
  });
  expect(c.find((x) => x.id === "guest")?.quantityRule).toMatchObject({
    scale: "guests",
    quantity: 1,
    perUnits: 25,
  });
  expect(c.find((x) => x.id === "variable")).toMatchObject({
    classification: "likely_member_variable_quantity",
    quantityRule: null,
  });
  expect(c.find((x) => x.id === "ninety")?.quantityRule).toMatchObject({
    scale: "fixed",
    quantity: 1,
    agreement: 0.9,
  });
});

it("accepts a seventy-five percent member but keeps less consistent equipment optional", () => {
  const cohort = Array.from({ length: 40 }, (_, id) => ({
    id,
    date: "2025-06-01",
  }));
  const rows: InventoryLine[] = [];
  for (let i = 0; i < 20; i++) {
    rows.push(line(i, `p-${i}`, "P", "EP"));
    if (i < 15) rows.push(line(i, `core-${i}`, "core", "E"));
    if (i < 14) rows.push(line(i, `extra-${i}`, "extra", "E"));
  }
  const candidates = analyzePackagePatterns(cohort, rows, "2026-09-28")
    .packages[0].candidates;
  expect(candidates.find((c) => c.id === "core")).toMatchObject({
    classification: "proposed_core",
    coverage: 0.75,
  });
  expect(candidates.find((c) => c.id === "extra")).toMatchObject({
    classification: "optional",
    coverage: 0.7,
  });
});
