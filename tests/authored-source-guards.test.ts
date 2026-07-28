import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const GENERATED_CONVEX_ROOT_FILES = new Set([
  "computed.ts",
  "crons.ts",
  "http.ts",
  "mutations.ts",
  "queries.ts",
  "sagas.ts",
  "schema.ts",
]);

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(filePath);
    return entry.isFile() ? [filePath] : [];
  });
}

function authoredConvexFiles(): string[] {
  const rootFiles = readdirSync("convex", { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !GENERATED_CONVEX_ROOT_FILES.has(entry.name),
    )
    .map((entry) => path.join("convex", entry.name));
  return [...rootFiles, ...filesUnder(path.join("convex", "lib"))].filter(
    (filePath) => filePath.endsWith(".ts"),
  );
}

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("authored source regression guards", () => {
  it("uses string field names as the first argument to withIndex callback eq calls", () => {
    const violations: string[] = [];
    const withIndexCall =
      /\.withIndex\s*\([\s\S]*?\)\s*(?=\s*\.(?:collect|filter|first|order|paginate|take|unique)\b)/g;

    for (const filePath of authoredConvexFiles()) {
      const source = readFileSync(filePath, "utf8");
      for (const call of source.matchAll(withIndexCall)) {
        const callbackParameter = call[0].match(
          /,\s*\(\s*([A-Za-z_$][\w$]*)/,
        )?.[1];
        if (!callbackParameter) continue;

        const escapedParameter = callbackParameter.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        );
        const equalityCall = new RegExp(
          `\\b${escapedParameter}\\.eq\\(\\s*([^\\s])`,
          "g",
        );
        for (const equality of call[0].matchAll(equalityCall)) {
          if (['"', "'", "`"].includes(equality[1])) continue;
          const offset = (call.index ?? 0) + (equality.index ?? 0);
          const line = source.slice(0, offset).split("\n").length;
          violations.push(`${filePath}:${line}`);
        }
      }
    }

    expect(
      violations,
      `Convex index equality calls require a field name. Fix each call as q.eq("fieldName", value); do not silence this guard.`,
    ).toEqual([]);
  });

  it("keeps public client pages independent of Route-only useParams context", () => {
    // App.tsx dispatches these pages with useMatch outside a <Route>, so
    // useParams would always return an empty object on public links.
    const pagePaths = [
      "src/features/clients/SharedProposalPage.tsx",
      "src/features/clients/ProposalAcceptancePage.tsx",
      "src/features/clients/ClientPortalPage.tsx",
    ].filter(existsSync);

    for (const filePath of pagePaths) {
      const source = withoutComments(readFileSync(filePath, "utf8"));
      expect(
        source,
        `${filePath} must receive its token as a prop`,
      ).not.toMatch(
        /import\s*{[^}]*\buseParams\b[^}]*}\s*from\s*["']react-router-dom["']/s,
      );
      expect(
        source,
        `${filePath} must receive its token as a prop`,
      ).not.toMatch(/\buseParams\s*\(/);
    }
  });

  it('never sends the useQuery-only "skip" sentinel as an ID property', () => {
    const violations: string[] = [];
    const skipIdProperty = /\b[A-Za-z_$][\w$]*Id\s*:\s*["']skip["']/g;

    for (const filePath of filesUnder(path.join("src", "features")).filter(
      (candidate) => /\.tsx?$/.test(candidate),
    )) {
      const source = readFileSync(filePath, "utf8");
      for (const match of source.matchAll(skipIdProperty)) {
        const line = source.slice(0, match.index ?? 0).split("\n").length;
        violations.push(`${filePath}:${line}`);
      }
    }

    expect(
      violations,
      `Optional IDs must be omitted when absent, never sent as "skip"; "skip" is only a generated useQuery sentinel.`,
    ).toEqual([]);
  });
});
