// AC-281 / AC-374 / AC-057: every executed TPP field mapping traces to a
// documented source field, and every documented field is either written to a
// Capsule record field or kept on the import link with a reason.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TPP_FIELD_DISPOSITIONS } from "../src/lib/tppFieldDisposition";

const root = join(__dirname, "..");
const datasetDoc = readFileSync(
  join(root, "src/import/import-dataset.manifest"),
  "utf8",
);

function documentedFields(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const blocks = datasetDoc.split(/^const /m).slice(1);
  for (const block of blocks) {
    const name = /^(TPP_\w+_MAPPINGS)/.exec(block)?.[1];
    if (!name) continue;
    out[name] = [...block.matchAll(/sourceField:\s*"([^"]+)"/g)].map(
      (match) => match[1]!,
    );
  }
  return out;
}

function manifestSources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...manifestSources(path));
    else if (entry.endsWith(".manifest"))
      files.push(readFileSync(path, "utf8"));
  }
  return files;
}

function entityBody(name: string): string {
  for (const source of manifestSources(join(root, "src"))) {
    const start = source.search(new RegExp(`^entity ${name}\\b`, "m"));
    if (start < 0) continue;
    const rest = source.slice(start + 1);
    const end = rest.search(/^(entity|event|enum) /m);
    return end < 0 ? rest : rest.slice(0, end);
  }
  return "";
}

describe("TPP field map parity with the documented map", () => {
  const documented = documentedFields();

  it("finds every documented TPP map", () => {
    expect(Object.keys(documented).sort()).toEqual(
      Object.keys(TPP_FIELD_DISPOSITIONS).sort(),
    );
    expect(documented.TPP_EVENT_MAPPINGS!.length).toBeGreaterThanOrEqual(27);
  });

  it("every documented field has a home, and no home names a field the map does not have", () => {
    for (const [block, fields] of Object.entries(documented)) {
      const homes = TPP_FIELD_DISPOSITIONS[block]!;
      expect(Object.keys(homes).sort(), block).toEqual(
        [...new Set(fields)].sort(),
      );
    }
  });

  it("every record home is a real field of its Capsule record, and every link home says why", () => {
    for (const [block, homes] of Object.entries(TPP_FIELD_DISPOSITIONS)) {
      for (const [sourceField, home] of Object.entries(homes)) {
        if (home.to === "link") {
          expect(home.why.length, `${block}.${sourceField}`).toBeGreaterThan(
            10,
          );
          continue;
        }
        const body = entityBody(home.entity);
        expect(body, `${home.entity} entity`).not.toBe("");
        expect(
          new RegExp(`property\\b[^\\n]*\\b${home.field}\\s*:`).test(body),
          `${block}.${sourceField} -> ${home.entity}.${home.field}`,
        ).toBe(true);
      }
    }
  });
});
