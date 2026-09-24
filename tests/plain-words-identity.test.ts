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

describe("plain words on leftover identity manifests", () => {
  it("keeps leftover identity READ copy free of read jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible =
      readFileSync("src/identity/person.manifest", "utf8") +
      readFileSync(
        "src/identity/email-notification-subscription.manifest",
        "utf8",
      );

    const stripped = visible.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "Staff may read people",
      "Users may read unowned creation drafts or their own email subscriptions",
    ]) {
      expect(stripped).not.toContain(old);
    }

    for (const fresh of [
      "Staff may see people",
      "Users may see unfinished email subscriptions or their own email subscriptions",
    ]) {
      expect(stripped).toContain(fresh);
      expectPlain(fresh);
    }

    for (const landed of [
      "Workforce managers may update people",
      "Workforce managers may change people",
      "Users may update only their own email subscriptions",
      "Users may configure only their own email subscriptions",
    ]) {
      expect(stripped).toContain(landed);
    }
  });
});
