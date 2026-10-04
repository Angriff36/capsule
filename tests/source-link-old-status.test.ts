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
import {
  oldSystemCancelReason,
  oldSystemFinishedStage,
} from "../convex/lib/oldSystemEventStage";

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

  it("copies a booked old event that is over, and a cancelled, lost or unbooked one", () => {
    const now = Date.UTC(2026, 9, 4);
    const past = now - 86_400_000;
    const future = now + 86_400_000;
    // TPP's report words, with their sort numbers.
    for (const booked of [
      "Complete",
      "Closed Out",
      "Approved",
      "Executing",
      "3- Final",
      "00- Closed",
      "1- Confirmed",
      "2- Sales Lock",
      "1- Sales Lock Planning",
    ]) {
      expect(oldSystemFinishedStage(booked, past, now)).toBe("completed");
      expect(oldSystemFinishedStage(booked, future, now)).toBeNull();
    }
    expect(oldSystemFinishedStage(" cancelled ", future, now)).toBe(
      "cancelled",
    );
    expect(oldSystemFinishedStage("9-Cancelled", future, now)).toBe(
      "cancelled",
    );
    expect(oldSystemFinishedStage("QUOTE (LOST)", future, now)).toBe(
      "cancelled",
    );
    expect(oldSystemCancelReason("QUOTE (LOST)")).toBe(
      "Quote lost in the old system",
    );
    // A quote whose date passed was never booked; one still to come waits.
    expect(oldSystemFinishedStage("0- Quote", past, now)).toBe("cancelled");
    expect(oldSystemCancelReason("0- Quote")).toBe(
      "Quote not booked in the old system before its date",
    );
    expect(oldSystemFinishedStage("0- Quote", future, now)).toBeNull();
    for (const other of ["Planning", ""]) {
      expect(oldSystemFinishedStage(other, past, now)).toBeNull();
    }
  });

  it("shows nothing extra when the import kept no status", () => {
    for (const raw of [null, "not json", JSON.stringify({ name: "x" })]) {
      const html = render([link(raw)]);
      expect(html).not.toContain("Status in the old system");
    }
  });
});
