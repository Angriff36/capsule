import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  checklistLinesFromText,
  checklistLinesJson,
  checklistLinesToText,
  dueToText,
  parseChecklistLines,
} from "../../lib/eventChecklists";
import { formatCountNoun } from "../../lib/format";
import {
  useCreateEventChecklist,
  useEventChecklistReinstate,
  useEventChecklistRetire,
  useEventChecklistRevise,
  useListEventChecklist,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import {
  EmptyState,
  PageHeader,
  StatusChip,
  TableSkeleton,
} from "../../ui/primitives";
import { useSuccessToast } from "../../ui/useSuccessToast";
import { resolveManifestPolicies } from "../admin/rolePermissionAudit";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { eventsIndexPath } from "./eventRoutes";
import { FailureBanner } from "./FailureBanner";

type ChecklistRow = {
  _id: string;
  version: number;
  name: string;
  category?: string | null;
  itemsJson: string;
  status: string;
  deletedAt?: number | null;
};

const EXAMPLE = `Book the venue permit | 14 days before | must | proof
Confirm the rental order | 3 days before | high
Check the van | 1 day before
Count the linen back in | 1 day after`;

/**
 * Event checklists: reusable lists of to-dos with due times counted from the
 * event's start. A checklist is put on an event from the event's To-dos
 * page; changing a checklist here does not change to-dos already on events.
 */
export function EventChecklistsPage() {
  const authStatus = useAuthStatus();
  const checklists = useListEventChecklist() as ChecklistRow[] | undefined;
  const define = useCreateEventChecklist();
  const revise = useEventChecklistRevise();
  const retire = useEventChecklistRetire();
  const reinstate = useEventChecklistReinstate();
  const [editing, setEditing] = useState<ChecklistRow | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const { notifySuccess, host: savedToast } = useSuccessToast();

  const permissions = new Set(resolveManifestPolicies(authStatus?.role ?? ""));
  const canManage = [
    "eventManageAccess",
    "logisticsAccess",
    "manageAccess",
  ].some((capability) => permissions.has(capability));
  const rows = (checklists ?? [])
    .filter((row) => row.deletedAt == null)
    .sort(
      (a, b) =>
        Number(a.status !== "active") - Number(b.status !== "active") ||
        a.name.localeCompare(b.name),
    );

  const run = async (
    key: string,
    work: () => Promise<unknown>,
    ok: string,
  ): Promise<boolean> => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
      notifySuccess(ok);
      return true;
    } catch (error) {
      setFailure(classifyCommandFailure(error));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const submit = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!editing) return;
    const data = new FormData(formEvent.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const category = String(data.get("category") ?? "").trim() || undefined;
    const itemsJson = checklistLinesJson(
      checklistLinesFromText(String(data.get("lines") ?? "")),
    );
    const target = editing;
    void run(
      "save",
      () =>
        target === "new"
          ? define({ name, category, itemsJson })
          : revise({
              docId: target._id,
              version: target.version,
              name,
              category,
              itemsJson,
            }),
      "Checklist saved",
    ).then((saved) => {
      if (saved) setEditing(null);
    });
  };

  const current = editing && editing !== "new" ? editing : null;

  return (
    <div className="operations-stage">
      <Link className="text-link" to={eventsIndexPath()}>
        ← Events
      </Link>
      <PageHeader
        eyebrow="Events · Checklists"
        title="Event checklists"
        lead="Reusable lists of to-dos. Put one on an event from the event's To-dos page."
        actions={
          canManage ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setEditing(editing === "new" ? null : "new")}
            >
              {editing === "new" ? "Close form" : "New checklist"}
            </button>
          ) : null
        }
      />
      {savedToast}
      {failure ? <FailureBanner failure={failure} /> : null}

      {editing && canManage ? (
        <form
          key={current?._id ?? "new"}
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={submit}
        >
          <label className="field-label">
            <span>Name</span>
            <input
              name="name"
              className="input min-h-10 w-full"
              required
              defaultValue={current?.name ?? ""}
              placeholder="For example: Off-site wedding"
            />
          </label>
          <label className="field-label">
            <span>Kind of work</span>
            <input
              name="category"
              className="input min-h-10 w-full"
              defaultValue={current?.category ?? ""}
              placeholder="For example: Paperwork"
            />
          </label>
          <label className="field-label sm:col-span-2">
            <span>To-dos, one per line</span>
            <textarea
              name="lines"
              className="input min-h-48 w-full font-mono"
              required
              defaultValue={
                current
                  ? checklistLinesToText(parseChecklistLines(current.itemsJson))
                  : ""
              }
              placeholder={EXAMPLE}
            />
          </label>
          <p className="text-sm text-ink-2 sm:col-span-2">
            After the to-do you can add, split by “|”: when it is due (“3 days
            before”, “2 hours after”, “at start”), how important it is (“must”,
            “high”, “low”), and “proof” when it needs a photo or file.
          </p>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy != null}
            >
              {busy === "save" ? "Saving…" : "Save checklist"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {checklists === undefined ? (
        <TableSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No checklists yet."
          hint="A checklist saves typing the same to-dos on every event."
          action={
            canManage ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setEditing("new")}
              >
                New checklist
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="mt-6 border-t-[1.5px] border-ink">
          {rows.map((row) => {
            const lines = parseChecklistLines(row.itemsJson);
            return (
              <li key={row._id} className="border-b border-line py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold text-ink">{row.name}</h2>
                    <p className="text-base text-ink-2">
                      {[row.category, formatCountNoun(lines.length, "to-do")]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip status={row.status} />
                    {canManage ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() => setEditing(row)}
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() =>
                            void run(
                              `${row._id}:status`,
                              () =>
                                (row.status === "active" ? retire : reinstate)({
                                  docId: row._id,
                                  version: row.version,
                                }),
                              row.status === "active"
                                ? "Checklist retired"
                                : "Checklist back in use",
                            )
                          }
                        >
                          {row.status === "active" ? "Retire" : "Use again"}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <ul className="mt-2 grid gap-0.5 text-base text-ink-2">
                  {lines.map((line) => (
                    <li key={line.key}>
                      {line.title}
                      {line.dueMinutesFromStart != null
                        ? ` · ${dueToText(line.dueMinutesFromStart)}`
                        : ""}
                      {line.priority === "critical" ? " · must do" : ""}
                      {line.proofRequired ? " · needs proof" : ""}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
