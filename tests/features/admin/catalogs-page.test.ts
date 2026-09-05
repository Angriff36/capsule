import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-text assertions (repo style — no @testing-library). AC-012: an
// admin/owner can add, relabel, retire and reactivate service styles and
// occasions from the app, and the event-create selector reflects the change
// without a redeploy or reload. Reactivity is structural: the admin page and
// every selector read the SAME live Convex lists (useList*), so a registered
// or retired row re-renders each consumer through the subscription.
const page = readFileSync("src/features/admin/CatalogsPage.tsx", "utf8");
const section = readFileSync("src/features/admin/CatalogsSection.tsx", "utf8");
const app = readFileSync("src/app/App.tsx", "utf8");
const nav = readFileSync("src/features/admin/AdminWorkspaceNav.tsx", "utf8");
const eventCreate = readFileSync(
  "src/features/events/EventCreatePage.tsx",
  "utf8",
);

const CATALOGS = ["ServiceStyle", "Occasion", "ReferralSource"] as const;

describe("admin catalogs page", () => {
  it("wires register, revise, deactivate, activate per catalog", () => {
    for (const entity of CATALOGS) {
      // add (governed create), relabel, retire, reactivate — the four
      // generated command hooks, wired per catalog on the page
      expect(page).toContain(`useCreate${entity}`);
      expect(page).toContain(`use${entity}ReviseDetails`);
      expect(page).toContain(`use${entity}Deactivate`);
      expect(page).toContain(`use${entity}Activate`);
      // the page reads the live list per catalog (a subscription, never a
      // snapshot), which is why selector changes need no reload
      expect(page).toContain(`useList${entity}`);
    }
    // the section invokes every command with the governed args: docId +
    // optimistic-concurrency version on row commands, and the deactivate
    // command's REQUIRED reason collected through the shared prompt
    expect(section).toContain("commands.register({");
    expect(section).toContain("commands.revise({");
    expect(section).toContain("commands.deactivate({");
    expect(section).toContain("commands.activate({");
    expect(section).toContain("askReason");
    expect(section).toContain("askFields");
    expect(section).toContain("docId: row._id");
    expect(section).toContain("version: row.version");
    expect(section).toContain("if (!reason) return;");
    // the lifecycle is visible: active rows offer rename/retire, retired
    // rows offer reactivate (retire is never a delete)
    expect(section).toContain("Retire");
    expect(section).toContain("Reactivate");
    expect(section).toContain('row.status === "active"');
  });

  it("is reachable: route and admin nav entry", () => {
    expect(app).toContain('path="/admin/catalogs"');
    expect(app).toContain("<CatalogsPage />");
    expect(nav).toContain('"/admin/catalogs"');
  });

  it("event-create selectors read the live catalog lists", () => {
    // the "without redeploy or reload" half of AC-012: the selectors
    // consume the same reactive lists the admin page writes through
    expect(eventCreate).toContain("useListServiceStyle");
    expect(eventCreate).toContain("useListOccasion");
  });
});
