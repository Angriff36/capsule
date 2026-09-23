import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FORBIDDEN =
  /\b(idempotency|tenant|seam|projection|canonical|hydrate|mapped|reaction|guard|policy|constraint|manifest|convex|builder|directory|record)\b/i;

function expectPlain(text: string) {
  expect(text).not.toMatch(FORBIDDEN);
  expect(text).not.toContain("CONVEX_FIELD_ENCRYPTION_KEY");
  expect(text).not.toContain("bun run");
}

describe("plain words on leftover cutover screen", () => {
  it("keeps leftover CutoverPage copy free of record run and mapping jargon", () => {
    const page = readFileSync(
      "src/features/admin/import/CutoverPage.tsx",
      "utf8",
    );

    for (const old of [
      "TPP Migration Cutover",
      "go/no-go gate",
      "Rollback Plan Required",
      "executing cutover decision",
      "Cutover Approved",
      "TPP migration cutover was approved",
      "Cutover Rejected",
      "TPP migration cutover was rejected",
      "Cutover Rolled Back",
      "Emergency rollback executed",
      "Cutover Validation",
      "Ready for Cutover",
      "Cutover Blocked",
      "Zero Critical Mappings",
      "legacy record mappings",
      "Resolve Mappings",
      "Document rollback strategy before cutover",
      "Execute GO Decision",
      "Execute NO-GO Decision",
      "execute cutover decisions",
      "Run one last import",
      "imported record",
      "Emergency Rollback",
    ]) {
      expect(page).not.toContain(old);
    }

    for (const fresh of [
      "Switch from TPP",
      "Last checks before Capsule takes over from TPP.",
      "Switch-back plan needed",
      "Write the switch-back plan before you approve or stop this switch.",
      "Switch approved",
      "The switch from TPP was approved on",
      "Switch stopped",
      "The switch from TPP was stopped on",
      "Switch undone",
      "Emergency switch-back happened on",
      "Switch checklist",
      "Ready to switch",
      "Not ready to switch",
      "Nothing left to match",
      "Every leftover TPP item is matched up",
      "Finish matching",
      "Write the switch-back plan before you switch",
      "Approve the switch",
      "Don't switch yet",
      "Only admins can approve or stop this switch.",
      "Do one last import to catch anything new in TPP",
      "Match up every leftover imported item",
      "Undo the switch",
    ]) {
      expect(page).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover cutover server copy free of record run and mapping jargon", () => {
    const source = readFileSync("convex/cutover.ts", "utf8");
    // strip // comments so developer notes are not treated as user copy
    const visible = source.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "No import runs found",
      "successful import run is required",
      "No import runs have been executed",
      "Latest import run has status",
      "Run a final delta import",
      "Latest import run is more than 7 days old",
      "All critical mappings verified",
      "unresolved TPP mappings",
      "critical TPP record mappings",
      "Reconcile Records page",
      "unverified mappings",
      "can record cutover approvals",
      "Cutover approvals recorded",
      "can execute cutover.",
      "Use recordCutoverApprovals first",
      "critical TPP mappings are unverified",
      "Latest import run is not completed",
      "Latest import run is stale",
      "or record NO-GO",
      "Cutover decision recorded",
      "can rollback cutover",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "No imports found",
      "At least one finished import is required",
      "No imports have been finished",
      "Latest import has status",
      "Do one last import.",
      "Latest import is more than 7 days old",
      "Every leftover TPP item is matched up",
      "leftover TPP items still need matching",
      "Use the match-up page to finish leftover TPP items",
      "Only admins can save the switch sign-off.",
      "Switch sign-off saved",
      "Only admins can approve or stop this switch.",
      "Can't switch yet: someone still needs to sign off.",
      "Can't switch yet: write the switch-back plan first.",
      "Can't switch yet: finish one last import first.",
      "Fix the connections, or choose Don't switch yet.",
      "Switch decision saved",
      "Only admins can undo the switch.",
      "Switch undone. TPP writes are back on.",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover cutover check-status copy free of validation jargon", () => {
    const serverSource = readFileSync("convex/cutover.ts", "utf8");
    // strip // comments so developer notes are not treated as user copy
    const serverVisible = serverSource.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const page = readFileSync(
      "src/features/admin/import/CutoverPage.tsx",
      "utf8",
    );
    const visible = `${serverVisible}\n${page}`;

    for (const old of [
      // page file, raw
      "Business Validation",
      "Requires manual sign-off from business stakeholders",
      "I approve this cutover",
      "Cutover approved",
      "Cutover rejected",
      "Rollback plan:",
      // server file, comments stripped
      "Pending manual sign-off",
      "No rollback plan documented",
      "Business sign-off confirmed",
      "Requires manual sign-off",
      "Business validation requires explicit approval",
      "Rollback plan documented",
      "Rollback plan not documented",
      "Rollback plan must be documented before cutover",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Waiting for a manager to sign off",
      "No switch-back plan written yet",
      "A manager has signed off",
      "A manager still needs to sign off",
      "A manager still needs to sign off on this switch",
      "Switch-back plan is written",
      "Write the switch-back plan before you switch",
      "Manager sign-off",
      "I approve this switch",
      "Switch approved - every check passed. Switch-back plan:",
      "Switch stopped -",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });
});
