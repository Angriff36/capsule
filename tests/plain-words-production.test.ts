import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Words the owner banned from user-visible copy (2026-09-23).
const FORBIDDEN =
  /\b(idempotency|tenant|seam|projection|canonical|hydrate|mapped|reaction|guard|policy|constraint|manifest|convex|builder|directory|record)\b/i;

function expectPlain(text: string) {
  expect(text).not.toMatch(FORBIDDEN);
  expect(text).not.toContain("CONVEX_FIELD_ENCRYPTION_KEY");
  expect(text).not.toContain("bun run");
}

describe("plain words on leftover production manifests", () => {
  it("keeps leftover production-manifest policy copy free of command jargon", () => {
    const files = [
      "src/production/task.manifest",
      "src/production/station.manifest",
      "src/production/batch.manifest",
      "src/production/task-comment.manifest",
      "src/production/prep.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "execute prep task commands",
      "execute prep task dependency commands",
      "execute prep task material commands",
      "execute station commands",
      "execute production batch commands",
      "execute batch allocation commands",
      "execute prep task comment commands",
      "execute quality check commands",
      "write prep tasks",
      "write prep task materials",
      "write stations",
      "write production batches",
      "write batch allocations",
      "post prep task comments",
      "write quality checks",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Kitchen and event managers may update prep tasks",
      "Kitchen and event managers may change prep tasks",
      "Kitchen and event managers may change prep task dependencies",
      "Kitchen and event managers may update prep task materials",
      "Kitchen and event managers may change prep task materials",
      "Kitchen staff and managers may update stations",
      "Kitchen staff and managers may change stations",
      "Kitchen staff and managers may update production batches",
      "Kitchen staff and managers may change production batches",
      "Kitchen staff and managers may update batch allocations",
      "Kitchen staff and managers may change batch allocations",
      "Kitchen staff and event managers may update prep task comments",
      "Kitchen staff and event managers may change prep task comments",
      "Kitchen staff may update quality checks",
      "Kitchen staff may change quality checks",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });
});
