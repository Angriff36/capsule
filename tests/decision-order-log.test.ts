/**
 * AC-391 (backend spec BE-1.6): every recorded disagreement names which
 * source won by the decision-order rule (1-6) and points at files that
 * exist; every manual procedure the spec puts in scope is listed with how
 * Capsule handles it.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LOG = readFileSync("docs/product/decision-order-log.md", "utf8");

const table = (heading: string) =>
  (LOG.split(`## ${heading}`)[1] ?? "")
    .split(/^## /m)[0]!
    .split("\n")
    .filter(
      (line) => /^\| [^-|]/.test(line) && !/^\| (#|Procedure) /.test(line),
    )
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );

const files = (cell: string) =>
  [...cell.matchAll(/`([^`]+\.[a-z]+)`/g)].map((m) => m[1]!);

describe("decision order log", () => {
  const rows = table("Disagreements and what won");

  it("records the disagreements in order, each with a rule from 1 to 6", () => {
    expect(rows.length).toBeGreaterThan(10);
    rows.forEach((row, index) => {
      expect(row[0]).toBe(String(index + 1));
      expect(row[4], row[1]).toMatch(/^[1-6]$/);
      expect(row[3]!.length, row[1]).toBeGreaterThan(0);
    });
  });

  it.each(rows.map((row) => [row[1]!, row] as const))(
    "%s points at files that exist",
    (_what, row) => {
      const named = files(row[5]!);
      expect(named.length).toBeGreaterThan(0);
      for (const file of named) expect(existsSync(file), file).toBe(true);
    },
  );

  it("lists every manual procedure the spec puts in scope, with proof", () => {
    const procedures = table("Manual procedures");
    expect(procedures.map((row) => row[0])).toEqual([
      "Sales Lock",
      "Ops Final Lock",
      "Print-ready / binder",
      "Pack list",
      "Equipment",
      "Timeline",
      "Setup",
      "Task breakdown",
      "Buffet",
      "Before takeoff",
      "Return",
    ]);
    for (const row of procedures) {
      expect(row[1], row[0]).toMatch(
        /Worked out|does not apply|missing fact|Field check/,
      );
      const named = files(row[2]!);
      expect(named.length, row[0]).toBeGreaterThan(0);
      for (const file of named) expect(existsSync(file), file).toBe(true);
    }
  });
});
