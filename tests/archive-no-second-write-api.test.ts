import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// AC-178 (PR01-required-no-second-write-api): the archive pipeline writes
// only import-pipeline metadata. Business records come in only through the
// governed generated commands importCommit funnels; the archive seams never
// touch a business table, never call a create command, and expose no
// public mutation of their own. Source-contract check over the real files.

const ACTION_SEAMS = [
  "convex/archiveInventory.ts",
  "convex/archiveDisposition.ts",
  "convex/archiveProvenance.ts",
];
const STORE = "convex/archiveInventoryStore.ts";
const PIPELINE_TABLES = new Set(["importArtifacts", "importRuns"]);

function source(path: string): string {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

function matches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1]!);
}

describe("archive pipeline has no second write API (AC-178)", () => {
  it("action seams write only through ImportArtifact/ImportRun commands", () => {
    for (const path of ACTION_SEAMS) {
      const text = source(path);
      // No direct database access from the actions at all.
      expect(text, path).not.toMatch(/ctx\.db\b/);
      // Every generated command they run belongs to the import pipeline.
      const commands = matches(text, /api\.mutations\.(\w+)/g);
      expect(commands.length, path).toBeGreaterThan(0);
      for (const name of commands) {
        expect(name, `${path} runs ${name}`).toMatch(
          /^(ImportArtifact|ImportRun)_/,
        );
        expect(name, `${path} runs ${name}`).not.toMatch(/_create/);
      }
      // Authored helpers they call live only in the archive store or the
      // read-only import context loader.
      for (const ref of matches(text, /internal\.(\w+)\.\w+/g)) {
        expect(["archiveInventoryStore", "importCoordinator"], path).toContain(
          ref,
        );
      }
      // Materialization stays in importCommit.
      expect(text, path).not.toMatch(
        /(api|internal)\.(importCommit|quickImport)\b|from "\.\/(importCommit|quickImport)"/,
      );
      // Only actions are exported — no public mutation beside the commands.
      expect(text, path).not.toMatch(
        /export const \w+ = (mutation|internalMutation)\(/,
      );
    }
  });

  it("the archive store touches only import-pipeline tables", () => {
    const text = source(STORE);
    expect(text).not.toMatch(/export const \w+ = mutation\(/);
    for (const table of matches(text, /ctx\.db\s*\.insert\(\s*"(\w+)"/g)) {
      expect(PIPELINE_TABLES.has(table), `insert into ${table}`).toBe(true);
    }
    // Reads may look at referencing tables (the storage claim check); the
    // only patch stamps an import artifact's timestamps.
    const patches = matches(text, /ctx\.db\.patch\(\s*(args\.\w+)/g);
    expect(patches).toEqual(["args.artifactId"]);
    expect(text).toMatch(/artifactId: v\.id\("importArtifacts"\)/);
    expect(text).not.toMatch(/ctx\.db\.(replace|delete)\(/);
  });
});
