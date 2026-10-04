/**
 * PL-REPLACEMENT-PROOF (TPP dossier): an imported event starts in Planning,
 * so its import panel must show the status the event had in TPP.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  SourceLinkList,
  type SourceLink,
} from "../src/features/events/SourceLinkList";
import { oldSystemFinishedStage } from "../convex/lib/oldSystemEventStage";

function link(rawSourceData: string | null): SourceLink {
  return {
    sourceSystem: "tpp_legacy",
    recordType: "event",
    externalId: "6014",
    conflictStatus: "resolved",
    verified: true,
    sourceImportRunId: null,
    fromReportFile: false,
    importedAt: null,
    resolutionNote: null,
    rawSourceData,
    mergedFromName: null,
  };
}

function render(links: SourceLink[]): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(SourceLinkList, { links })),
  );
}

describe("old-system status on an imported event", () => {
  it("shows the TPP status and that the event starts in Planning", () => {
    const html = render([
      link(JSON.stringify({ rawEventStatus: "Confirmed", sourceRow: {} })),
    ]);
    expect(html).toContain("Status in the old system");
    expect(html).toContain("Confirmed");
    expect(html).toContain("the others start in Planning");
  });

  it("copies only a finished old event that is over, or a cancelled one", () => {
    const now = Date.UTC(2026, 9, 4);
    const past = now - 86_400_000;
    const future = now + 86_400_000;
    expect(oldSystemFinishedStage("Complete", past, now)).toBe("completed");
    expect(oldSystemFinishedStage("Closed Out", past, now)).toBe("completed");
    expect(oldSystemFinishedStage("Complete", future, now)).toBeNull();
    expect(oldSystemFinishedStage(" cancelled ", future, now)).toBe(
      "cancelled",
    );
    for (const live of ["Quote", "Planning", "Approved", "Executing", ""]) {
      expect(oldSystemFinishedStage(live, past, now)).toBeNull();
    }
  });

  it("shows nothing extra when the import kept no status", () => {
    for (const raw of [null, "not json", JSON.stringify({ name: "x" })]) {
      const html = render([link(raw)]);
      expect(html).not.toContain("Status in the old system");
    }
  });
});
