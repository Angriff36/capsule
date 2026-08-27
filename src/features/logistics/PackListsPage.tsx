import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { formatCountNoun } from "../../lib/format";
import {
  useCreatePackList,
  useListEvent,
  useListPackList,
  usePackListCancel,
  usePackListDispatch,
  usePackListMarkLoaded,
  usePackListMarkPacked,
  usePackListStartPacking,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { LogisticsFailureBanner } from "./LogisticsFailureBanner";
import { LogisticsLifecyclePolicy } from "./LogisticsLifecyclePolicy";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";
import { useActionNotice } from "../../ui/action-result";

const policy = new LogisticsLifecyclePolicy();

export function PackListsPage() {
  const packLists = useListPackList();
  const events = useListEvent();
  const createPackList = useCreatePackList();
  const startPacking = usePackListStartPacking();
  const markPacked = usePackListMarkPacked();
  const markLoaded = usePackListMarkLoaded();
  const dispatch = usePackListDispatch();
  const cancel = usePackListCancel();
  const [showCreate, setShowCreate] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();
  const { prompt, host } = useActionPrompt(busy != null);

  const activeRows = (packLists ?? []).filter((row) => row.deletedAt == null);
  const visibleRows = showCancelled
    ? activeRows
    : activeRows.filter((row) => String(row.status) !== "cancelled");
  const eventName = (id: string) =>
    events?.find((event) => event._id === id)?.title ?? "Unknown event";

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
    const data = new FormData(form);
    void run("create-pack", async () => {
      await createPackList({
        eventId: String(data.get("eventId")),
        name: String(data.get("name") || "").trim(),
        purpose: String(data.get("purpose") || "") || undefined,
        notes: String(data.get("notes") || "") || undefined,
      });
      form.reset();
      setShowCreate(false);
      setNotice("Pack list opened.");
    });
  };

  const invoke = (
    row: { _id: string; version: number; status: unknown },
    key: string,
  ) => {
    void (async () => {
      if (key === "cancel") {
        const reason = await prompt.askReason({
          ...ReasonCopy.cancelPackList,
          tone: "danger",
        });
        if (!reason) return;
        void run(`${row._id}:${key}`, async () => {
          await cancel({ docId: row._id, version: row.version, reason });
          setNotice("Pack list cancelled.");
        });
        return;
      }
      void run(`${row._id}:${key}`, async () => {
        const args = { docId: row._id, version: row.version };
        if (key === "startPacking") await startPacking(args);
        if (key === "markPacked") await markPacked(args);
        if (key === "markLoaded") await markLoaded(args);
        if (key === "dispatch") await dispatch(args);
        setNotice(`Pack list updated (${key}).`);
      });
    })();
  };

  const loading = packLists === undefined || events === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Logistics · Pack lists</p>
          <h1 className="display-title mt-2">Event pack lists</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Open a pack list for an event, pack items on the load sheet, then
            mark packed, loaded, and dispatched before scheduling delivery.
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setShowCancelled((value) => !value)}
          >
            {showCancelled ? "Hide cancelled" : "Show cancelled"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowCreate((value) => !value)}
          >
            {showCreate ? "Close form" : "Open pack list"}
          </button>
        </div>
      </header>
      <LogisticsWorkspaceNav />
      {failure ? <LogisticsFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      {showCreate ? (
        <form className="supply-form" onSubmit={submitCreate}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">New pack list</p>
              <h2>Open a pack list</h2>
            </div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "create-pack" ? "Opening…" : "Open"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Event
              <select name="eventId" className="input" required>
                <option value="">Select event</option>
                {(events ?? [])
                  .filter((item) => item.deletedAt == null)
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Name
              <input
                name="name"
                className="input"
                placeholder="Main load"
                required
              />
            </label>
            <label className="field-label">
              Purpose
              <input name="purpose" className="input" placeholder="Service" />
            </label>
            <label className="field-label">
              Notes
              <input name="notes" className="input" />
            </label>
          </div>
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Dispatch trace</p>
            <h2>Pack lists</h2>
          </div>
          <span>{formatCountNoun(visibleRows.length, "list")}</span>
        </div>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : visibleRows.length === 0 ? (
          <div className="document-empty">
            <p>No pack lists are open.</p>
            <span>Open a pack list for an event to start packing.</span>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowCreate(true)}
              >
                Open pack list
              </button>
            </div>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Event</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <Link
                        className="text-link"
                        to={`/logistics/packs/${row._id}`}
                      >
                        <strong>{row.name || "Untitled pack list"}</strong>
                      </Link>
                      {row.purpose ? <small>{row.purpose}</small> : null}
                    </td>
                    <td>{eventName(row.eventId)}</td>
                    <td>
                      <StatusChip status={String(row.status)} />
                    </td>
                    <td>
                      <div className="supply-row-actions">
                        <Link
                          className="btn btn-ghost btn-sm"
                          to={`/logistics/packs/${row._id}`}
                        >
                          Load sheet
                        </Link>
                        {policy
                          .packListActions(String(row.status))
                          .map((action) => (
                            <button
                              key={action.key}
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => invoke(row, action.key)}
                            >
                              {busy === `${row._id}:${action.key}`
                                ? "Working…"
                                : action.label}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
