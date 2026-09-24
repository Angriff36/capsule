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

describe("plain words on leftover admin manifests", () => {
  it("keeps leftover admin identity and facilities-manifest policy copy free of command jargon", () => {
    const files = [
      "src/admin/announcement.manifest",
      "src/admin/assistant.manifest",
      "src/admin/capability-setting.manifest",
      "src/admin/cutover-decision.manifest",
      "src/identity/person.manifest",
      "src/identity/email-notification-subscription.manifest",
      "src/facilities/equipment.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "execute announcement commands",
      "execute assistant configuration",
      "execute assistant upload commands",
      "execute capability setting commands",
      "execute cutover decision commands",
      "execute people commands",
      "execute equipment commands",
      "execute equipment handoff commands",
      "execute equipment maintenance commands",
      "execute equipment service commands",
      "write announcements",
      "write their own announcement dismissals",
      "write assistant configuration",
      "write capability settings",
      "write cutover decisions",
      "write people",
      "write only their own email subscriptions",
      "write equipment",
      "record equipment service",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Staff may update announcements",
      "Staff may change announcements",
      "Staff may update their own announcement dismissals",
      "Managers and admins may update assistant configuration",
      "Managers and admins may change assistant configuration",
      "Staff may change assistant uploads",
      "Authenticated staff may update capability settings",
      "Authenticated staff may change capability settings",
      "Authenticated staff may update cutover decisions",
      "Authenticated staff may change cutover decisions",
      "Workforce managers may update people",
      "Workforce managers may change people",
      "Users may update only their own email subscriptions",
      "Inventory or logistics staff may update equipment",
      "Inventory or logistics staff may change equipment",
      "Inventory or logistics staff may change equipment handoffs, or event managers stand down a cancelled event",
      "Inventory or logistics staff may change equipment maintenance",
      "Inventory or logistics staff may add equipment service",
      "Inventory or logistics staff may change equipment service",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover admin READ copy free of read jargon", () => {
    const files = [
      "src/admin/announcement.manifest",
      "src/admin/assistant.manifest",
      "src/admin/capability-setting.manifest",
      "src/admin/cutover-decision.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "Staff may read announcements",
      "Staff may read announcement dismissals",
      "Managers and admins may read assistant configuration",
      "Authenticated staff may read capability settings",
      "Authenticated staff may read cutover decisions",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Staff may see announcements",
      "Staff may see announcement dismissals",
      "Managers and admins may see assistant configuration",
      "Authenticated staff may see capability settings",
      "Authenticated staff may see cutover decisions",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    // already-landed write leftovers must stay put
    expect(visible).toContain("Staff may update announcements");
    expect(visible).toContain("Staff may change announcements");
    expect(visible).toContain(
      "Staff may update their own announcement dismissals",
    );
    expect(visible).toContain(
      "Managers and admins may update assistant configuration",
    );
    expect(visible).toContain(
      "Managers and admins may change assistant configuration",
    );
    expect(visible).toContain(
      "Authenticated staff may update capability settings",
    );
    expect(visible).toContain(
      "Authenticated staff may change capability settings",
    );
    expect(visible).toContain(
      "Authenticated staff may update cutover decisions",
    );
    expect(visible).toContain(
      "Authenticated staff may change cutover decisions",
    );
    expect(visible).toContain("Staff may see assistant upload registrations");
  });
});
