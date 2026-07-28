import { useState, type FormEvent } from "react";
import {
  useCreateSavedReportDefinition,
  useListSavedReportDefinition,
  useSavedReportDefinitionArchive,
  useSavedReportDefinitionChangeSharing,
  useSavedReportDefinitionRename,
  useSavedReportDefinitionRestore,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { formatStatusLabel } from "../../lib/statusLabels";
import {
  ReportCreateForm,
  ReportCreatePayloadBuilder,
  REPORT_SHARING_SCOPES,
} from "./ReportCreateForm";
import { ReportLifecyclePolicy } from "./ReportLifecyclePolicy";
import { ReportsFailureBanner } from "./ReportsFailureBanner";

const policy = new ReportLifecyclePolicy();
const payloadBuilder = new ReportCreatePayloadBuilder();

export function ReportsPage() {
  const reports = useListSavedReportDefinition();
  const createReport = useCreateSavedReportDefinition();
  const rename = useSavedReportDefinitionRename();
  const changeSharing = useSavedReportDefinitionChangeSharing();
  const archive = useSavedReportDefinitionArchive();
  const restore = useSavedReportDefinitionRestore();
  const [showCreate, setShowCreate] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const activeRows = (reports ?? []).filter((row) => row.deletedAt == null);
  const definedRows = activeRows.filter((row) => row.definedAt != null);
  const visibleRows = showArchived
    ? definedRows
    : definedRows.filter((row) => String(row.status) !== "archived");

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
        await createReport(payload);
        form.reset();
        setShowCreate(false);
        setNotice("Report definition saved.");
      });
    } catch (error) {
      setFailure(error);
    }
  };

  const invokeLifecycle = (
    row: { _id: string; version: number; status: unknown },
    key: string,
  ) => {
    void run(`${row._id}:${key}`, async () => {
      if (key === "archive") {
        await archive({ docId: row._id, version: row.version });
        setNotice("Report archived.");
        return;
      }
      await restore({ docId: row._id, version: row.version });
      setNotice("Report restored.");
    });
  };

  const invokeRename = (row: {
    _id: string;
    version: number;
    name?: string | null;
  }) => {
    void (async () => {
      const values = await prompt.askFields({
        title: "Rename report",
        description: "Update the display name for this saved definition.",
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

  const invokeShare = (row: {
    _id: string;
    version: number;
    sharingScope?: string | null;
  }) => {
    void (async () => {
      const values = await prompt.askFields({
        title: "Change sharing",
        description:
          "Use owner_only, team, or tenant_wide. Managers and the owner may change this.",
        fields: [
          {
            name: "sharingScope",
            label: "Sharing scope",
            defaultValue: String(row.sharingScope ?? "owner_only"),
            required: true,
            helper: "owner_only | team | tenant_wide",
          },
        ],
        confirmLabel: "Update sharing",
      });
      if (!values) return;
      const sharingScope = String(values.sharingScope || "").trim();
      if (
        !REPORT_SHARING_SCOPES.includes(
          sharingScope as (typeof REPORT_SHARING_SCOPES)[number],
        )
      ) {
        setFailure(
          new Error("Sharing must be owner_only, team, or tenant_wide."),
        );
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

  const loading = reports === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <h1 className="display-title">Saved reports</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Governed report definitions you can save, rename, share, archive,
            and restore. Chart result rendering is not part of this slice.
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
            {showCreate ? "Close form" : "New definition"}
          </button>
        </div>
      </header>

      {failure ? <ReportsFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-[13px] text-ink-2" role="status">
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

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <h2>Definitions</h2>
          </div>
          <span>{visibleRows.length} rows</span>
        </div>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : visibleRows.length === 0 ? (
          <div className="document-empty">
            <p>No saved report definitions.</p>
            <span>
              Save a definition to keep chart configuration under governance.
            </span>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowCreate(true)}
              >
                New definition
              </button>
            </div>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Subject</th>
                  <th>Chart</th>
                  <th>Sharing</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const status = String(row.status);
                  const editable = policy.canEditDefinition(
                    status,
                    row.definedAt,
                  );
                  return (
                    <tr key={row._id}>
                      <td>
                        <strong>{String(row.name || "Untitled")}</strong>
                      </td>
                      <td>{formatStatusLabel(String(row.subjectArea))}</td>
                      <td>{formatStatusLabel(String(row.chartType))}</td>
                      <td>
                        {formatStatusLabel(
                          String(row.sharingScope || "owner_only"),
                        )}
                      </td>
                      <td>
                        <StatusChip status={status} />
                      </td>
                      <td>
                        <div className="supply-row-actions">
                          {editable ? (
                            <>
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={busy != null}
                                onClick={() => invokeRename(row)}
                              >
                                Rename
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
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
                              disabled={busy != null}
                              onClick={() => invokeLifecycle(row, action.key)}
                            >
                              {busy === `${row._id}:${action.key}`
                                ? "Working…"
                                : action.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
