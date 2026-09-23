import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyCommandFailure } from "../src/features/events/CommandFailure";

// Words the owner banned from user-visible copy (2026-09-23).
const FORBIDDEN =
  /\b(idempotency|tenant|seam|projection|canonical|hydrate|mapped|reaction|guard|policy|constraint|manifest|convex|builder|directory|record)\b/i;

function expectPlain(text: string) {
  expect(text).not.toMatch(FORBIDDEN);
  expect(text).not.toContain("CONVEX_FIELD_ENCRYPTION_KEY");
  expect(text).not.toContain("bun run");
}

describe("plain words on event screens", () => {
  it("classifies raw server errors with plain titles and details", () => {
    const conflict = classifyCommandFailure(
      "ConcurrencyConflict: VERSION_MISMATCH",
    );
    expect(conflict.category).toBe("conflict");
    expect(conflict.title).toBe("Someone else changed this");
    expect(conflict.detail).not.toMatch(/\brecord\b/i);
    expectPlain(`${conflict.title} ${conflict.detail}`);

    const missing = classifyCommandFailure("not found");
    expect(missing.category).toBe("conflict");
    expect(missing.title).toBe("This isn't available anymore");
    expectPlain(`${missing.title} ${missing.detail}`);

    const noWorkspace = classifyCommandFailure("No tenant");
    expect(noWorkspace.category).toBe("denied");
    expectPlain(`${noWorkspace.title} ${noWorkspace.detail}`);

    const guardBlocked = classifyCommandFailure(
      "[CONVEX M(mutations:Ingredient_createViaIntroduce)] [Request ID: a95c55eb16003c2d] Server Error\nUncaught Error: Guard 0 failed\nCalled by client",
    );
    expect(guardBlocked.category).toBe("guard_blocked");
    expect(guardBlocked.title).toBe("Ingredient wasn't created");
    expect(guardBlocked.detail).not.toMatch(/\bGuard\b/);
    expect(guardBlocked.detail).not.toContain("CONVEX");
    expect(guardBlocked.detail).not.toMatch(/\brecord\b/i);
    expectPlain(`${guardBlocked.title} ${guardBlocked.detail}`);

    const staffDenied = classifyCommandFailure(
      "Event staff may execute event commands",
    );
    expect(staffDenied.category).toBe("denied");
    expect(staffDenied.title).toBe("You can't do this");
    expect(staffDenied.detail).toBe(
      "Your account does not have access. Ask someone who can, or switch to an account that can.",
    );
    expect(staffDenied.detail).not.toMatch(/\bpolicy\b/i);
    expect(staffDenied.detail).not.toMatch(/\bexecute\b/i);
    expect(staffDenied.detail).not.toMatch(/\bcommands?\b/i);
    expectPlain(`${staffDenied.title} ${staffDenied.detail}`);
  });

  it("replaces the old event-import strings with plain catering words", () => {
    const importPage = readFileSync(
      "src/features/events/import/EventImportPage.tsx",
      "utf8",
    );
    const matchCard = readFileSync(
      "src/features/events/import/EventImportMatchCard.tsx",
      "utf8",
    );
    const draftPanel = readFileSync(
      "src/features/events/import/EventImportDraftPanel.tsx",
      "utf8",
    );
    const previewPanel = readFileSync(
      "src/features/events/import/EventImportPreviewPanel.tsx",
      "utf8",
    );
    const all = `${importPage}\n${matchCard}\n${draftPanel}`;

    expect(previewPanel).not.toContain("steps</li>");
    expect(previewPanel).not.toContain("{plan.steps.length} steps");
    expect(previewPanel).toContain("menu lines");
    expect(previewPanel).toContain("event-import-summary");

    for (const old of [
      "Checking existing records",
      "A new record is created on import",
      "No source files recorded",
      "Not recorded in the source",
      "in one step",
      "Creating…",
      "Steps that finished",
    ]) {
      expect(all).not.toContain(old);
    }
    for (const fresh of [
      "at once.",
      "Creating the event…",
      "Checking clients, venues, and dishes already in Capsule…",
      "What already saved stays.",
      "A new one is added when you create the event.",
      "No source files on this import.",
      "Not on the worksheet",
      "These menu lines are not yet tied to a dish on the event.",
    ]) {
      expect(all).toContain(fresh);
    }
  });

  it("keeps the create page aside free of developer words", () => {
    const page = readFileSync(
      "src/features/events/EventCreatePage.tsx",
      "utf8",
    );
    expect(page).not.toContain("policy-checked");
    expect(page).not.toContain("guard failure");
    expect(page).toContain(
      "If something can't be created, the reason appears above.",
    );
    expect(page).toContain("Fix it and");
  });

  it("keeps the guests tab intro plain", () => {
    const page = readFileSync(
      "src/features/events/EventDetailPage.tsx",
      "utf8",
    );
    expect(page).not.toContain("record dietary needs");
    expect(page).toContain(
      "note dietary needs so they show up on the allergen briefing",
    );
  });

  it("keeps the tab error boundary free of shell commands and raw errors", () => {
    const boundary = readFileSync(
      "src/features/events/EventTabErrorBoundary.tsx",
      "utf8",
    );
    expect(boundary).not.toContain("bun run");
    expect(boundary).not.toContain("dev:convex");
    expect(boundary).toContain(
      "This tab is newer than the live app behind it. Reload the page. If it still fails, ask the office to update Capsule.",
    );
    expect(boundary).toContain(
      "Something on this tab failed. Try again. If it keeps failing, reload the page.",
    );
  });

  it("keeps leftover event screens free of record jargon", () => {
    const files = [
      "src/features/events/beoPdf.ts",
      "src/features/events/EventClientBillingPanel.tsx",
      "src/features/events/EventClientTab.tsx",
      "src/features/events/EventClientContactsPanel.tsx",
      "src/features/events/EventCapacityPlannerPage.tsx",
      "src/features/events/EventAllergenBriefingPage.tsx",
      "src/features/events/GuestListCoverageNotice.tsx",
    ];
    const all = files.map((path) => readFileSync(path, "utf8")).join("\n");

    for (const old of [
      "Not recorded",
      "Live event record",
      "client record",
      "Client record not found",
      "Open client record",
      "None recorded for this event",
      "No contact recorded",
      "Capacity not recorded",
      "capacity not recorded",
      "Recorded capacity",
      "guests are recorded",
      "No guests recorded",
      "not recorded yet",
      "Record them on the event",
    ]) {
      expect(all).not.toContain(old);
    }
    for (const fresh of [
      "Not listed",
      "BEO | This event",
      "Not on file",
      "Owned on the client page",
      "Open client",
      "None noted for this event.",
      "No notes on this client yet.",
      "Edit on the client page",
      "live on the client page.",
      "No contact on file.",
      "on the client page",
      "Add contacts on the client page",
      "Capacity not on file",
      "Capacity on file",
      "No guests are on the list for this event",
      "expected guests are on the list",
      "Add them on the event",
      "No guests on the list — this event expects",
      "not on the list yet",
    ]) {
      expect(all).toContain(fresh);
    }
  });

  it("keeps leftover event packet menu staffing and guest copy free of record jargon", () => {
    const files = [
      "src/features/events/packet/EventPacketPanel.tsx",
      "src/features/events/EventMenuTab.tsx",
      "src/features/events/EventMenuDietaryConflictsCard.tsx",
      "src/features/events/EventOverviewRail.tsx",
      "src/features/events/EventStaffingTab.tsx",
      "src/features/events/EventGuestSidebar.tsx",
      "src/features/events/eventGuestSummary.ts",
      "src/features/events/EventPhotosAlbums.tsx",
      "src/features/events/EventPrepList.tsx",
      "src/features/events/EventEquipmentPanel.tsx",
      "src/features/events/EventTimingPlanner.tsx",
      "src/features/events/venuePickerSummary.ts",
      "src/features/events/mobile/MobileEventInfoCards.tsx",
      "src/features/events/mobile/MobileEventReadCards.tsx",
      "src/features/events/EventCreatePage.tsx",
      "src/features/events/EventSourceProvenancePanel.tsx",
      "src/features/events/eventRoutes.ts",
      "src/features/events/EventTimelineTab.tsx",
      "src/features/events/LiveEventProfitabilityWidget.tsx",
    ];
    const all = files.map((path) => readFileSync(path, "utf8")).join("\n");

    for (const old of [
      "Not recorded",
      "Current Capsule records stay authoritative.",
      "Recorded revision",
      "Update native record",
      "Record decision",
      "The event guest count is not recorded.",
      "Opens the shared catalog record.",
      "Matches words in the catalog record,",
      "No operational requirements recorded.",
      "recorded work stay intact.",
      "Record why this open shift is coming down.",
      "recorded work stays with its original staff member.",
      "sold covers recorded.",
      "Nothing recorded yet.",
      "recorded guests have",
      'NO_DIETARY_LABEL = "None recorded"',
      "Time not recorded",
      "Could not record the choice.",
      "No prep steps recorded for this dish.",
      "condition is recorded in the equipment catalog.",
      "keeps its recorded timing.",
      "Timing saved to the shared run.",
      "No address recorded",
      "No notes recorded for this event.",
      "No staff coverage recorded.",
      "This venue has no capacity recorded",
      'title="Imported record"',
      'label: "Records"',
      "day-of run sheet",
      "keep recorded times.",
      "priced records to date",
      "time record",
      "Removed from the run",
    ]) {
      expect(all).not.toContain(old);
    }
    for (const fresh of [
      "Not on file",
      "What's already on this event stays in charge.",
      "This version",
      "Update what's on this event",
      "Save this choice",
      "This event has no guest count. Enter the servings to add.",
      "Opens the shared dish.",
      "Matches words on the shared dish,",
      "No operational requirements on file.",
      "hours already entered stay intact.",
      "Say why this open shift is coming down.",
      "hours already entered stay with the original staff member.",
      "sold covers on the list.",
      "Nothing on the list yet.",
      "guests on the list",
      'NO_DIETARY_LABEL = "None noted"',
      "Time not listed",
      "Could not save the choice.",
      "No prep steps on file for this dish.",
      "condition is saved on the equipment.",
      "keeps its saved timing.",
      "Timing saved on this event.",
      "No address on file",
      "No notes on this event.",
      "No staff coverage on file.",
      "This venue has no capacity on file",
      'title="Imported from"',
      'label: "Photos & incidents"',
      "day-of timeline",
      "keep the saved times.",
      "priced so far",
      "time card",
      "Removed from this event",
    ]) {
      expect(all).toContain(fresh);
    }
  });
});
