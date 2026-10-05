/**
 * AC-389 (spec §1.4 "never guess travel"): the straight-line distance and
 * 40 km/h estimate in the route planner is a browser-only suggestion. No
 * server code and no screen that saves anything may use it, so no saved
 * road time (event timing, route legs, Final Lock) can come from it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const ESTIMATES = /\b(routeLegs|haversineKm|suggestVisitOrder|AVG_SPEED_KMH)\b/;
const PLANNER = /from\s+["'][^"']*\/routePlanner["']/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === "_generated" || entry.name === "node_modules"
        ? []
        : files(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const rel = (path: string) => relative(ROOT, path).split(sep).join("/");

describe("no road time from straight-line distance anywhere it is kept", () => {
  it("only the browser-only route planner page uses the straight-line estimate", () => {
    const users = [...files(join(ROOT, "src")), ...files(join(ROOT, "convex"))]
      .filter((path) => {
        const text = readFileSync(path, "utf8");
        return PLANNER.test(text) && ESTIMATES.test(text);
      })
      .map(rel);
    expect(users).toEqual(["src/features/logistics/RoutePlannerPage.tsx"]);
  });

  it("no server code imports the route planner", () => {
    const server = files(join(ROOT, "convex"))
      .filter((path) => PLANNER.test(readFileSync(path, "utf8")))
      .map(rel);
    expect(server).toEqual([]);
  });

  it("the route planner page saves nothing and says so", () => {
    const page = readFileSync(
      join(ROOT, "src/features/logistics/RoutePlannerPage.tsx"),
      "utf8",
    );
    expect(page).not.toMatch(/useMutation|useAction/);
    // It only reads lists; no command hook (use<Entity><Command>) is imported.
    const generated = page.match(
      /import\s*\{([^}]*)\}\s*from\s*["'][^"']*manifest-convex-react["']/,
    );
    const hooks = (generated?.[1] ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    expect(hooks.every((name) => /^use(List|Get)[A-Z]/.test(name))).toBe(true);
    expect(page).toContain("not saved");
  });
});
