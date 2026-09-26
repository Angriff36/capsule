import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Words the owner banned from user-visible copy (2026-09-23).
const FORBIDDEN =
  /\b(idempotency|tenant|seam|projection|canonical|hydrate|mapped|reaction|guard|policy|constraint|manifest|convex|builder|directory|record|records|recorded|entity|seeded|through commands)\b/i;

function manifestFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === "generated" ? [] : manifestFiles(path);
    return path.endsWith(".manifest") ? [path] : [];
  });
}

// The message a user sees is the trailing string on a constraint, guard or policy line.
const MESSAGE_LINE =
  /^\s*(?:default\s+)?(?:constraint|guard|policy)\b.*"([^"]*)"\s*$/;

describe("plain words in every rule message", () => {
  it("no rule message a user can see uses developer words", () => {
    const offenders: string[] = [];
    for (const file of manifestFiles("src")) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const message = MESSAGE_LINE.exec(line)?.[1];
        // A one-word string at the end is a status value in the rule (e.g. == "recorded"), not a message.
        // "insurance policy" is a real-world term, not the system word.
        if (
          message?.includes(" ") &&
          FORBIDDEN.test(message.replace(/insurance policy/gi, ""))
        )
          offenders.push(`${file}:${i + 1} ${message}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
