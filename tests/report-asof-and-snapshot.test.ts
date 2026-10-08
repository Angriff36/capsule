// @vitest-environment jsdom
// AC-147 — a live report names the time of its newest source change, a saved
// snapshot keeps its figures exactly and is dated after the records change,
// and a screen that lost its connection says its figures may be out of date
// instead of calling them current.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  snapshots: [] as Record<string, unknown>[],
  captured: [] as Record<string, unknown>[],
}));

vi.mock("../src/lib/manifest-convex-react", () => ({
  useListPerson: () => [],
  useListOccasion: () => [],
  useListServiceStyle: () => [],
  useListVenue: () => [],
  useListReferralSource: () => [],
  useListSavedReportSnapshot: () => store.snapshots,
  useCreateSavedReportSnapshot: () => async (args: Record<string, unknown>) => {
    store.captured.push(args);
    const docId = `snap-${store.snapshots.length + 1}`;
    store.snapshots = [
      ...store.snapshots,
      {
        _id: docId,
        version: 1,
        ...args,
        capturedAt: Date.UTC(2026, 9, 1, 15, 0),
        capturedByPersonId: "person-me",
      },
    ];
    return { docId };
  },
  useSavedReportSnapshotRemove: () => async () => undefined,
}));
// The screen reads only this report's snapshots.
vi.mock("../src/lib/financeScopedQueries", () => ({
  useReportSnapshotRows: () => store.snapshots,
}));
vi.mock("../src/lib/useAuthStatus", () => ({
  useAuthStatus: () => ({ personId: "person-me", role: "admin" }),
}));

import { LiveReportWorkspace } from "../src/features/reports/LiveReportWorkspace";
import { ReportSnapshots } from "../src/features/reports/ReportSnapshots";
import { buildLiveReportModel } from "../src/features/reports/liveReportBuilders";
import {
  readReportSnapshotFigures,
  reportSnapshotFigures,
  reportSourceAsOf,
} from "../src/features/reports/reportSnapshot";
import type { LiveReportModel } from "../src/features/reports/liveReportModel";
import type { ReportFreshness } from "../src/features/reports/reportSnapshot";

const now = Date.now();
const DAY = 86_400_000;
const report = {
  _id: "rep-1",
  version: 1,
  status: "active",
  name: "Pipeline",
  sharingScope: "team",
};
const proposals = (accepted: number) => [
  {
    _id: "p-1",
    proposalNumber: "P-100",
    status: "accepted",
    total: accepted,
    sentAt: now - DAY,
    updatedAt: now - 2 * 60_000,
  },
  {
    _id: "p-2",
    proposalNumber: "P-101",
    status: "sent",
    total: 300,
    sentAt: now - 2 * DAY,
    updatedAt: now - DAY,
  },
];

describe("report as-of time, snapshots and stale figures", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    store.snapshots = [];
    store.captured = [];
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function show(model: LiveReportModel, freshness: ReportFreshness) {
    const sourceAsOf = reportSourceAsOf(proposals(0));
    act(() => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(LiveReportWorkspace, {
            report,
            subject: "sales",
            savedDateWindow: "30_days",
            savedChartType: "table",
            usedChartFallback: false,
            model,
            loading: false,
            sourceAvailable: true,
            busy: false,
            canEditSettings: true,
            onApply: () => undefined,
            filters: {},
            onFiltersChange: () => undefined,
            leftOut: { noEvent: 0, filteredOut: 0 },
            sourceAsOf,
            freshness,
            snapshots: createElement(ReportSnapshots, {
              report,
              subject: "sales",
              model,
              chartType: "table",
              dateWindow: "30_days",
              filters: {},
              leftOut: { noEvent: 0, filteredOut: 0 },
              sourceAsOf,
              canTake: freshness.live,
            }),
          }),
        ),
      );
    });
  }

  it("a saved report can be captured as a dated reproducible snapshot and a failed refresh shows a stale warning instead of current-looking figures", async () => {
    const text = () => container.textContent ?? "";
    const live: ReportFreshness = { live: true, lastLiveAt: now };
    const before = buildLiveReportModel("sales", proposals(500), "30_days");

    // As-of: the newest source change is named next to the figures.
    expect(reportSourceAsOf(proposals(500))).toBe(now - 2 * 60_000);
    show(before, live);
    expect(text()).toContain("Current data");
    expect(text()).toContain("Figures as of");
    expect(text()).not.toContain("Not up to date");

    // Snapshot: take one, then the records change.
    const take = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Take a snapshot",
    )!;
    await act(async () => take.click());
    expect(store.captured).toHaveLength(1);
    const kept = readReportSnapshotFigures(store.captured[0].figures);
    expect(kept?.model.kpis).toEqual(before.kpis);
    expect(kept?.model.rows).toEqual(before.rows);
    expect(kept).toEqual(
      reportSnapshotFigures({
        chartType: "table",
        dateWindow: "30_days",
        filters: {},
        leftOut: { noEvent: 0, filteredOut: 0 },
        model: before,
      }),
    );

    const after = buildLiveReportModel("sales", proposals(900), "30_days");
    const acceptedBefore = before.kpis.find(
      (kpi) => kpi.metricId === "sales.accepted_value",
    )!.value;
    const acceptedAfter = after.kpis.find(
      (kpi) => kpi.metricId === "sales.accepted_value",
    )!.value;
    expect(acceptedAfter).not.toBe(acceptedBefore);
    show(after, live);
    const view = container.querySelector(
      "[data-testid='report-snapshot-view']",
    );
    expect(view?.textContent).toContain("Snapshot taken");
    expect(view?.textContent).toContain("These figures do not change");
    expect(view?.textContent).toContain(acceptedBefore);
    expect(view?.textContent).not.toContain(acceptedAfter);

    // Stale: the connection dropped, so the figures are not called current.
    show(after, { live: false, lastLiveAt: now - 5 * 60_000 });
    expect(text()).toContain("Not up to date");
    expect(text()).not.toContain("Current data");
    const stale = container.querySelector(
      "[data-testid='report-stale-notice']",
    );
    expect(stale?.textContent).toContain("Capsule lost its connection at");
    expect(stale?.textContent).toContain("may be out of date");
    const takeWhileStale = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Take a snapshot",
    );
    expect(takeWhileStale?.disabled).toBe(true);
  });
});
