/**
 * The UI-coverage table must not claim a call site that does not exist
 * (2026-09-29: PrepTask.refreshGenerated listed three pages, none of which
 * called its hook). Every listed surface file must reference at least one of
 * the listed hooks.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CAPABILITY_UI_SURFACES,
  CapsuleCommandUiCoverage,
} from "../../src/agent/CapsuleCommandUiCoverage";

describe("CapsuleCommandUiCoverage is true to the feature code", () => {
  it("every listed surface calls one of the listed hooks", () => {
    const false_claims: string[] = [];
    for (const [capabilityId, surface] of Object.entries(
      CAPABILITY_UI_SURFACES,
    )) {
      if (surface === null) continue;
      for (const file of surface.surfaces) {
        const source = readFileSync(file, "utf8");
        const calls = surface.hooks.some((hook) =>
          new RegExp(`\\b${hook}\\b`).test(source),
        );
        if (!calls) false_claims.push(`${capabilityId} -> ${file}`);
      }
    }
    expect(false_claims).toEqual([]);
  });

  it("reports PrepTask.refreshGenerated as having no UI", () => {
    expect(
      new CapsuleCommandUiCoverage().hasUi("PrepTask.refreshGenerated"),
    ).toBe(false);
  });
});
