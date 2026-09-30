/**
 * AC-231 / AC-371 (CF-3-4, CF-15): the equipment pack list and the food prep
 * list are two systems. Their manifests share no relation, their screens use
 * no words of the other, and neither command set writes the other's records.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) return files(rel, ext);
      return ext.test(entry.name) ? [rel] : [];
    },
  );
}

function hits(paths: string[], pattern: RegExp): string[] {
  return paths.flatMap((file) =>
    readFileSync(path.join(root, file), "utf8")
      .split("\n")
      .flatMap((line, index) =>
        pattern.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [],
      ),
  );
}

const PREP_WORDS = /\bprep\s*(list|task|board)s?\b|\bPrep(List|Task)\b/i;
const PACK_WORDS = /\bpack\s*list|\bPackList(Item)?\b|\bload sheet\b/i;

describe("pack lists and prep lists stay separate (AC-231, AC-371)", () => {
  it("pack-list screens and manifests never use prep-list words or entities", () => {
    const pack = [
      ...files("src/features/logistics", /\.(ts|tsx)$/),
      "src/logistics/pack-list.manifest",
      "src/logistics/pack-list-template.manifest",
      "src/logistics/pack-rule.manifest",
    ];
    expect(hits(pack, PREP_WORDS)).toEqual([]);
  });

  it("prep screens and manifests never use pack-list words or entities", () => {
    const prep = [
      ...files("src/features/production", /\.(ts|tsx)$/),
      ...files("src/production", /\.manifest$/),
    ];
    expect(hits(prep, PACK_WORDS)).toEqual([]);
  });

  it("no pack-list command or reaction runs a prep command, and no prep command touches pack lines", () => {
    const packManifest = readFileSync(
      path.join(root, "src/logistics/pack-list.manifest"),
      "utf8",
    );
    expect(packManifest).not.toMatch(
      /\brun\s+PrepTask\b|\bfanOut\s+PrepTask\b/,
    );
    for (const file of files("src/production", /\.manifest$/)) {
      const text = readFileSync(path.join(root, file), "utf8");
      expect(text, file).not.toMatch(
        /\brun\s+PackList(Item)?\b|\bfanOut\s+PackList(Item)?\b/,
      );
    }
  });
});
