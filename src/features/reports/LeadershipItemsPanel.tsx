import { useState, type FormEvent } from "react";
import {
  useCreateLeadershipItem,
  useLeadershipItemComplete,
  useLeadershipItemDrop,
  useLeadershipItemReopen,
} from "@/lib/manifest-convex-react";
import { Section, StatusChip } from "@/ui/primitives";
import { CHIP_TONE_CLASS } from "@/lib/statusLabels";
import { formatDate } from "@/lib/format";
import { BoundedDateInput } from "@/ui/BoundedDateInputs";
import { ReportsFailureBanner } from "./ReportsFailureBanner";
import {
  LEADERSHIP_KIND_LABEL,
  isOverdue,
  liveItems,
  type LeadershipItemKind,
  type LeadershipItemRow,
} from "./leadershipHistory";
import type { ScorecardPerson } from "./ScorecardTargetEditor";

const KINDS: ReadonlyArray<{
  kind: LeadershipItemKind;
  title: string;
  empty: string;
  placeholder: string;
}> = [
  {
    kind: "rock",
    title: "Priorities (90-day rocks)",
    empty: "No open priorities.",
    placeholder: "What must be done this quarter",
  },
  {
    kind: "issue",
    title: "Issues",
    empty: "No open issues.",
    placeholder: "What needs solving",
  },
  {
    kind: "todo",
    title: "To-dos",
    empty: "No open to-dos.",
    placeholder: "Who does what before next week",
  },
];

/** Closed items stay on the board for two weeks, so last week's are reviewed. */
const RECENTLY_CLOSED_DAYS = 14;

function localDateEpoch(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "");
  if (!text) return undefined;
  return new Date(`${text}T12:00:00`).getTime();
}

export function LeadershipItemsPanel({
  items,
  people,
  now,
}: {
  items: readonly LeadershipItemRow[];
  people: readonly ScorecardPerson[];
  now: Date;
}) {
  const addItem = useCreateLeadershipItem();
  const completeItem = useLeadershipItemComplete();
  const dropItem = useLeadershipItemDrop();
  const reopenItem = useLeadershipItemReopen();
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const personName = (id: string | null | undefined) => {
    if (!id) return "No owner";
    const person = people.find((row) => row._id === id);
    return person
      ? `${person.givenName} ${person.familyName}`.trim()
      : "No owner";
  };

  const run = async (work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(true);
    try {
      await work();
      return true;
    } catch (error) {
      setFailure(error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = (
    event: FormEvent<HTMLFormElement>,
    kind: LeadershipItemKind,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run(() =>
      addItem({
        kind,
        title: String(data.get("title") || ""),
        ownerPersonId: String(data.get("ownerPersonId") || "") || undefined,
        dueAt: localDateEpoch(data.get("dueAt")),
      }),
    ).then((ok) => {
      if (ok) form.reset();
    });
  };

  const closedSince =
    now.getTime() - RECENTLY_CLOSED_DAYS * 24 * 60 * 60 * 1000;
  const shown = liveItems(items).filter(
    (row) =>
      row.status === "open" ||
      (row.closedAt != null && row.closedAt >= closedSince),
  );

  return (
    <div className="mt-6 grid gap-6" data-testid="leadership-items">
      {failure ? <ReportsFailureBanner error={failure} /> : null}
      {KINDS.map(({ kind, title, empty, placeholder }) => {
        const rows = shown
          .filter((row) => row.kind === kind)
          .sort(
            (a, b) =>
              (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) ||
              (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity),
          );
        return (
          <Section key={kind} title={title}>
            {rows.length === 0 ? (
              <p className="text-xs text-ink-2">{empty}</p>
            ) : (
              <div className="supply-table-wrap">
                <table
                  className="supply-table"
                  data-testid={`leadership-${kind}`}
                >
                  <thead>
                    <tr>
                      <th>{LEADERSHIP_KIND_LABEL[kind]}</th>
                      <th>Owner</th>
                      <th>Due</th>
                      <th>Status</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row._id}>
                        <td>{row.title}</td>
                        <td>{personName(row.ownerPersonId)}</td>
                        <td
                          className={isOverdue(row, now) ? "text-danger" : ""}
                        >
                          {row.dueAt ? formatDate(row.dueAt) : "—"}
                          {isOverdue(row, now) ? " (late)" : ""}
                        </td>
                        <td>
                          <StatusChip
                            status={
                              row.status === "open"
                                ? "Open"
                                : row.status === "done"
                                  ? "Done"
                                  : "Dropped"
                            }
                            color={
                              row.status === "open"
                                ? CHIP_TONE_CLASS.warn
                                : row.status === "done"
                                  ? CHIP_TONE_CLASS.ok
                                  : CHIP_TONE_CLASS.mute
                            }
                          />
                        </td>
                        <td className="text-right">
                          {row.status === "open" ? (
                            <>
                              <button
                                type="button"
                                className="btn-link btn-link-compact"
                                disabled={busy}
                                onClick={() =>
                                  void run(() =>
                                    completeItem({
                                      docId: row._id,
                                      version: row.version,
                                    }),
                                  )
                                }
                              >
                                Done
                              </button>{" "}
                              <button
                                type="button"
                                className="btn-link btn-link-compact text-ink-2"
                                disabled={busy}
                                onClick={() =>
                                  void run(() =>
                                    dropItem({
                                      docId: row._id,
                                      version: row.version,
                                    }),
                                  )
                                }
                              >
                                Drop
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn-link btn-link-compact"
                              disabled={busy}
                              onClick={() =>
                                void run(() =>
                                  reopenItem({
                                    docId: row._id,
                                    version: row.version,
                                  }),
                                )
                              }
                            >
                              Reopen
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <form
              className="supply-form-grid mt-3"
              onSubmit={(event) => submit(event, kind)}
            >
              <label className="field-label">
                Add {LEADERSHIP_KIND_LABEL[kind].toLowerCase()}
                <input
                  name="title"
                  className="input"
                  placeholder={placeholder}
                  required
                />
              </label>
              <label className="field-label">
                Owner
                <select name="ownerPersonId" className="input" defaultValue="">
                  <option value="">No owner</option>
                  {people.map((person) => (
                    <option key={person._id} value={person._id}>
                      {`${person.givenName} ${person.familyName}`.trim()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Due (optional)
                <BoundedDateInput name="dueAt" className="input" />
              </label>
              <div className="field-label">
                <span>&nbsp;</span>
                <button className="btn btn-secondary" disabled={busy}>
                  Add
                </button>
              </div>
            </form>
          </Section>
        );
      })}
    </div>
  );
}
