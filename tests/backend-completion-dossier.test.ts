/**
 * AC-713..AC-727 (BE-21): the backend completion dossier names, for each of
 * the fifteen definitions of done, the rows and proofs it rests on. A
 * definition marked PASS may rest only on PASS rows and proof files that
 * exist; an open one must match the ledger's "waits on" reason.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadInputs } from "../scripts/coverage-ledger";

const DOSSIER = "docs/product/backend-completion-dossier.md";
const { ledger } = loadInputs();
const byId = new Map(ledger.criteria.map((c) => [c.id, c]));

interface Definition {
  number: string;
  id: string;
  verdict: string;
  rows: string[];
  files: string[];
}

function parseDossier(text: string): Definition[] {
  return text
    .split(/^## /m)
    .slice(1)
    .flatMap((section) => {
      const head = section.match(/^(\d\d) · (AC-\d+) · /);
      if (!head) return [];
      const field = (name: string) =>
        section.match(new RegExp(`^- ${name}: (.+)$`, "m"))?.[1] ?? "";
      return [
        {
          number: head[1]!,
          id: head[2]!,
          verdict: field("Verdict"),
          rows: field("Rows").match(/AC-\d+/g) ?? [],
          files: [...section.matchAll(/`((?:tests|docs)\/[^`]+)`/g)].map(
            (m) => m[1]!,
          ),
        },
      ];
    });
}

const definitions = parseDossier(readFileSync(DOSSIER, "utf8"));

describe("backend completion dossier", () => {
  it("has the fifteen definitions in order, AC-713 to AC-727", () => {
    expect(definitions.map((d) => d.number)).toEqual(
      Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(2, "0")),
    );
    expect(definitions.map((d) => d.id)).toEqual(
      Array.from({ length: 15 }, (_, i) => `AC-${713 + i}`),
    );
  });

  it.each(definitions.map((d) => [d.number, d] as const))(
    "definition %s names proofs that exist and agrees with the ledger",
    (_number, d) => {
      for (const file of d.files) expect(existsSync(file), file).toBe(true);
      const entry = byId.get(d.id)!;
      if (d.verdict === "PASS") {
        expect(d.rows.length).toBeGreaterThan(0);
        for (const row of d.rows)
          expect(byId.get(row)?.status, `${d.id} rests on ${row}`).toBe("PASS");
        expect(entry.status, `${d.id} in the ledger`).toBe("PASS");
      } else {
        expect(d.verdict).toMatch(/^OPEN \(.+\)$/);
        expect(entry.status, `${d.id} in the ledger`).toBe("PENDING");
        if (entry.waitsOn)
          expect(d.verdict).toBe(`OPEN (waits on ${entry.waitsOn})`);
      }
    },
  );
});
