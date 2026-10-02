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
    expect(html).toContain("Imported events start in Planning here.");
  });

  it("shows nothing extra when the import kept no status", () => {
    for (const raw of [null, "not json", JSON.stringify({ name: "x" })]) {
      const html = render([link(raw)]);
      expect(html).not.toContain("Status in the old system");
    }
  });
});
