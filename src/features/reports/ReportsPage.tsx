import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  useCreateSavedReportDefinition,
  useListSavedReportDefinition,
  useSavedReportDefinitionArchive,
  useSavedReportDefinitionChangeSharing,
  useSavedReportDefinitionRename,
  useSavedReportDefinitionRestore,
  useSavedReportDefinitionUpdateDefinition,
} from "../../lib/manifest-convex-react";
import { formatStatusLabel } from "../../lib/statusLabels";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { useActionNotice } from "../../ui/action-result";
import { useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import {
  ReportCreateForm,
  ReportCreatePayloadBuilder,
  REPORT_SHARING_SCOPES,
  SHARING_SCOPE_LABELS,
  type ReportChartType,
  type ReportSharingScope,
} from "./ReportCreateForm";
import { LiveReportData } from "./LiveReportData";
import { LiveReportWorkspace } from "./LiveReportWorkspace";
import {
  normalizeReportChart,
  normalizeReportSubject,
  parseLiveReportDefinition,
  type ReportDateWindow,
  type SavedReportRow,
} from "./liveReportModel";
import { canEditSavedReportDefinition } from "./reportEditAccess";
import { ReportLifecyclePolicy } from "./ReportLifecyclePolicy";
import { ReportsFailureBanner } from "./ReportsFailureBanner";
import { TppReportCatalog } from "./tpp/TppReportCatalog";

const policy = new ReportLifecyclePolicy();
const payloadBuilder = new ReportCreatePayloadBuilder();

export function ReportsPage() {
  const [view, setView] = useState<"catalog" | "saved">("catalog");
  return (
    <>
      <nav className="report-view-switch" aria-label="Report views">
        <button
          className={view === "catalog" ? "is-active" : ""}
          type="button"
          onClick={() => setView("catalog")}
        >
          TPP report catalog
        </button>
        <button
          className={view === "saved" ? "is-active" : ""}
          type="button"
          onClick={() => setView("saved")}
        >
          Saved reports
        </button>
      </nav>
      {view === "catalog" ? <TppReportCatalog /> : <SavedReportsPage />}
    </>
  );
}

function SavedReportsPage() {
  const reportQuery = useListSavedReportDefinition();
  const reports = reportQuery as SavedReportRow[] | undefined;
  const createReport = useCreateSavedReportDefinition();
  const rename = useSavedReportDefinitionRename();
  const changeSharing = useSavedReportDefinitionChangeSharing();
  const archive = useSavedReportDefinitionArchive();
  const restore = useSavedReportDefinitionRestore();
  const updateDefinition = useSavedReportDefinitionUpdateDefinition();
  const [showCreate, setShowCreate] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();
  const { prompt, host } = useActionPrompt(busy != null);

  const { currentRows, definedRows } = useMemo(() => {
    const activeRows = (reports ?? []).filter((row) => row.deletedAt == null);
    const defined = activeRows.filter((row) => row.definedAt != null);
    return {
      currentRows: defined.filter((row) => String(row.status) !== "archived"),
      definedRows: defined,
    };
  }, [reports]);
  const visibleRows = showArchived ? definedRows : currentRows;
  const selectedReport =
    currentRows.find((row) => row._id === selectedId) ?? null;

  const selectReport = (reportId: string) => {
    setSelectedId(reportId);
  };

  useEffect(() => {
    if (selectedId && currentRows.some((row) => row._id === selectedId)) {
      return;
    }
    setSelectedId(currentRows[0]?._id ?? null);
  }, [currentRows, selectedId]);

  useEffect(() => {
    if (!selectedId || !window.matchMedia("(max-width: 1080px)").matches) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById("live-report-title")
        ?.closest(".live-report")
        ?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId]);

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const payload = payloadBuilder.fromForm(new FormData(form));
      void run("create-report", async () => {
        const created = (await createReport(payload)) as { docId?: string };
        if (created.docId) selectReport(String(created.docId));
        form.reset();
        setShowCreate(false);
        setNotice("Live report created.");
      });
    } catch (error) {
      setFailure(error);
    }
  };

  const invokeLifecycle = (row: SavedReportRow, key: string) => {
    void run(`${row._id}:${key}`, async () => {
      if (key === "archive") {
        await archive({ docId: row._id, version: row.version });
        setNotice("Report archived.");
        return;
      }
      await restore({ docId: row._id, version: row.version });
      selectReport(row._id);
      setNotice("Report restored.");
    });
  };

  const invokeRename = (row: SavedReportRow) => {
    void (async () => {
      const values = await prompt.askFields({
        title: "Rename report",
        description: "Update the display name for this live report.",
        fields: [
          {
            name: "name",
            label: "Name",
            defaultValue: String(row.name ?? ""),
            required: true,
          },
        ],
        confirmLabel: "Rename",
      });
      if (!values) return;
      const name = String(values.name || "").trim();
      if (!name) {
        setFailure(new Error("Report name is required."));
        return;
      }
      void run(`${row._id}:rename`, async () => {
        await rename({ docId: row._id, version: row.version, name });
        setNotice("Report renamed.");
      });
    })();
  };

  const invokeShare = (row: SavedReportRow) => {
    void (async () => {
      const values = await prompt.askFields({
        title: "Change sharing",
        description:
          "Choose who can discover this report. Source permissions still apply.",
        fields: [
          {
            name: "sharingScope",
            label: "Who can see it",
            defaultValue: String(row.sharingScope ?? "owner_only"),
            required: true,
            options: REPORT_SHARING_SCOPES.map((scope) => ({
              value: scope,
              label: SHARING_SCOPE_LABELS[scope],
            })),
          },
        ],
        confirmLabel: "Update sharing",
      });
      if (!values) return;
      const sharingScope = String(values.sharingScope || "").trim();
      if (!REPORT_SHARING_SCOPES.includes(sharingScope as ReportSharingScope)) {
        setFailure(new Error("Choose who can see this report."));
        return;
      }
      void run(`${row._id}:share`, async () => {
        await changeSharing({
          docId: row._id,
          version: row.version,
          sharingScope,
        });
        setNotice("Sharing updated.");
      });
    })();
  };

  const applyReportSettings = (
    row: SavedReportRow,
    dateWindow: ReportDateWindow,
    chartType: ReportChartType,
  ) => {
    const definition = parseLiveReportDefinition(row.definition);
    void run(`${row._id}:apply`, async () => {
      await updateDefinition({
        docId: row._id,
        version: row.version,
        chartType,
        definition: {
          version: 2,
          dateWindow,
          notes: definition.notes,
        },
      });
      setNotice("Live report settings applied.");
    });
  };

  const loading = reports === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <h1 className="display-title">Live reports</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Saved views of current Capsule operations. Open a report to see live
            KPIs, a chart, and the source records behind every number.
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setShowArchived((value) => !value)}
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowCreate((value) => !value)}
          >
            {showCreate ? "Close form" : "New report"}
          </button>
        </div>
      </header>

      {failure ? <ReportsFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      {showCreate ? (
        <ReportCreateForm
          busy={busy === "create-report"}
          onSubmit={submitCreate}
        />
      ) : null}

      <div className="reports-workspace-grid">
        {selectedReport ? (
          <SelectedReport
            report={selectedReport}
            busy={busy === `${selectedReport._id}:apply`}
            onApply={(dateWindow, chartType) =>
              applyReportSettings(selectedReport, dateWindow, chartType)
            }
          />
        ) : (
          <section className="live-report live-report-placeholder">
            <div className="document-empty">
              <p>No live report is open.</p>
              <span>Create or open a saved report to query current data.</span>
            </div>
          </section>
        )}

        <section
          className="saved-report-index"
          aria-labelledby="saved-reports-heading"
        >
          <div className="ledger-heading">
            <h2 id="saved-reports-heading">Saved reports</h2>
            <span>{visibleRows.length} saved</span>
          </div>
          {loading ? (
            <TableSkeleton rows={5} />
          ) : visibleRows.length === 0 ? (
            <div className="document-empty">
              <p>No saved reports yet.</p>
              <span>
                Create one to open live operational results immediately.
              </span>
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowCreate(true)}
                >
                  New report
                </button>
              </div>
            </div>
          ) : (
            <div className="saved-report-list">
              {visibleRows.map((row) => {
                const status = String(row.status);
                const editable = policy.canEditDefinition(
                  status,
                  row.definedAt,
                );
                const isSelected = selectedReport?._id === row._id;
                return (
                  <article
                    className={`saved-report-item${isSelected ? " is-selected" : ""}`}
                    key={row._id}
                  >
                    <div className="saved-report-item-heading">
                      <div>
                        <strong>{String(row.name || "Untitled")}</strong>
                        <span>
                          {formatStatusLabel(String(row.subjectArea))} ·{" "}
                          {formatStatusLabel(String(row.chartType))}
                        </span>
                      </div>
                      <StatusChip status={status} />
                    </div>
                    <span className="saved-report-sharing">
                      {(SHARING_SCOPE_LABELS as Record<string, string>)[
                        String(row.sharingScope ?? "owner_only")
                      ] ?? formatStatusLabel(String(row.sharingScope))}
                    </span>
                    <div className="saved-report-actions">
                      {status !== "archived" ? (
                        <button
                          className={
                            isSelected
                              ? "btn btn-primary btn-sm"
                              : "btn btn-ghost btn-sm"
                          }
                          type="button"
                          disabled={busy != null}
                          onClick={() => selectReport(row._id)}
                        >
                          {isSelected ? "Open" : "View report"}
                        </button>
                      ) : null}
                      {editable ? (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            disabled={busy != null}
                            onClick={() => invokeRename(row)}
                          >
                            Rename
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            disabled={busy != null}
                            onClick={() => invokeShare(row)}
                          >
                            Share
                          </button>
                        </>
                      ) : null}
                      {policy.reportActions(status).map((action) => (
                        <button
                          key={action.key}
                          className="btn btn-ghost btn-sm"
                          type="button"
                          disabled={busy != null}
                          onClick={() => invokeLifecycle(row, action.key)}
                        >
                          {busy === `${row._id}:${action.key}`
                            ? "Working…"
                            : action.label}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SelectedReport({
  report,
  busy,
  onApply,
}: {
  report: SavedReportRow;
  busy: boolean;
  onApply: (dateWindow: ReportDateWindow, chartType: ReportChartType) => void;
}) {
  const authStatus = useAuthStatus();
  // Same rule as the updateDefinition command: the owner, or manageAccess.
  // A team- / company-shared report opens for every reader who can see the
  // subject, and Apply used to stay live for them until the guard rejected it.
  const canEditSettings = canEditSavedReportDefinition(report, {
    personId: authStatus?.personId,
    role: authStatus?.role,
  });
  const subject = normalizeReportSubject(report.subjectArea);
  if (!subject) {
    return (
      <section className="live-report">
        <div className="document-empty live-report-unavailable">
          <p>This report uses an unsupported subject area.</p>
          <span>
            Create a new report with one of the available live subjects.
          </span>
        </div>
      </section>
    );
  }

  const definition = parseLiveReportDefinition(report.definition);
  const chart = normalizeReportChart(report.chartType);
  return (
    <LiveReportData subject={subject} dateWindow={definition.dateWindow}>
      {({ model, loading, sourceAvailable }) => (
        <LiveReportWorkspace
          report={report}
          subject={subject}
          savedDateWindow={definition.dateWindow}
          savedChartType={chart.chartType}
          usedChartFallback={chart.usedFallback}
          model={model}
          loading={loading}
          sourceAvailable={sourceAvailable}
          busy={busy}
          canEditSettings={canEditSettings}
          onApply={onApply}
        />
      )}
    </LiveReportData>
  );
}
