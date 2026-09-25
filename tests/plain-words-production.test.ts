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

  it("keeps leftover production READ copy free of read jargon", () => {
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
      "Kitchen staff may read quality checks",
      "Kitchen staff and event managers may read prep task comments",
      "Kitchen staff and managers may read production batches",
      "Kitchen staff and managers may read batch allocations",
      "Employed staff may read stations",
      "Kitchen and event managers may read prep tasks",
      "Kitchen and event managers may read prep task dependencies",
      "Kitchen and event managers may read prep task materials",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Kitchen staff may see quality checks",
      "Kitchen staff and event managers may see prep task comments",
      "Kitchen staff and managers may see production batches",
      "Kitchen staff and managers may see batch allocations",
      "Employed staff may see stations",
      "Kitchen and event managers may see prep tasks",
      "Kitchen and event managers may see prep task dependencies",
      "Kitchen and event managers may see prep task materials",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    // already-landed write leftovers must stay put
    expect(visible).toContain(
      "Kitchen and event managers may update prep tasks",
    );
    expect(visible).toContain("Kitchen staff and managers may update stations");
    expect(visible).toContain(
      "Kitchen staff and managers may update production batches",
    );
    expect(visible).toContain(
      "Kitchen staff and managers may update batch allocations",
    );
    expect(visible).toContain(
      "Kitchen staff and event managers may update prep task comments",
    );
    expect(visible).toContain("Kitchen staff may update quality checks");
    expect(visible).toContain(
      "Kitchen and event managers may declare prep task dependencies",
    );
  });
});
