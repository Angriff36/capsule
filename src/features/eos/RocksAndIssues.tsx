import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateLeadershipItem,
  useLeadershipItemBringBack,
  useLeadershipItemDrop,
  useLeadershipItemPark,
  useListLeadershipItem,
} from "@/lib/manifest-convex-react";
import { StatusChip } from "@/ui/primitives";
import { formatDate } from "@/lib/format";
import {
  ROCK_TRACK_LABEL,
  type LeadershipItemRow,
} from "../reports/leadershipHistory";
import { EOS_PATHS, initials, personName, quarterStart } from "./eosModel";
import { useActivePeople, useEosViewer } from "./useEosData";
import { useRun } from "./EosShared";

const TRACK_TONE = {
  on_track: "chip-tone-ok",
  at_risk: "chip-tone-warn",
  off_track: "chip-tone-danger",
} as const;

/**
 * The V/TO's live parts from the L10 records: this quarter's Rocks, and the
 * long-term issues list (issues parked out of the weekly meeting).
 */
export function RocksAndIssues({ part }: { part: "rocks" | "issues" }) {
  const items = useListLeadershipItem() as LeadershipItemRow[] | undefined;
  const people = useActivePeople();
  const { canEdit } = useEosViewer();
  const addItem = useCreateLeadershipItem();
  const park = useLeadershipItemPark();
  const bringBack = useLeadershipItemBringBack();
  const drop = useLeadershipItemDrop();
  const { run, busy, banner } = useRun();
  const [draft, setDraft] = useState("");

  if (items === undefined)
    return <p className="text-sm text-ink-3">Loading…</p>;

  if (part === "rocks") {
    const since = quarterStart(new Date()).getTime();
    const rocks = items
      .filter(
        (row) =>
          row.kind === "rock" &&
          (row.status === "open" || (row.closedAt ?? 0) >= since),
      )
      .sort(
        (a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1),
      );
    const done = rocks.filter((row) => row.status === "done").length;
    return (
      <div className="grid gap-2">
        {rocks.length === 0 ? (
          <p className="text-sm text-ink-3">
            No Rocks set for this quarter yet.
          </p>
        ) : (
          <ul className="eos-list">
            {rocks.map((row) => {
              const owner = personName(people, row.ownerPersonId, "No owner");
              return (
                <li
                  key={row._id}
                  className={`eos-list-row${row.status === "done" ? " is-done" : ""}`}
                >
                  <span className="eos-avatar" title={owner}>
                    {initials(owner)}
                  </span>
                  <div className="min-w-0 text-base">
                    <span
                      className={
                        row.status === "done"
                          ? "text-ink-3 line-through"
                          : "text-ink"
                      }
                    >
                      {row.title}
                    </span>
                    <span className="block text-xs text-ink-3">
                      {owner}
                      {row.dueAt ? ` · due ${formatDate(row.dueAt)}` : ""}
                    </span>
                  </div>
                  {row.status === "open" ? (
                    row.track ? (
                      <StatusChip
                        status={row.track}
                        color={TRACK_TONE[row.track]}
                        label={ROCK_TRACK_LABEL[row.track]}
                      />
                    ) : (
                      <StatusChip
                        status="unmarked"
                        color="chip-tone-mute"
                        label="Not marked"
                      />
                    )
                  ) : (
                    <StatusChip
                      status="done"
                      color="chip-tone-ok"
                      label="Done"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-ink-3">
          {rocks.length > 0
            ? `${done} of ${rocks.length} done this quarter. `
            : ""}
          <Link to={`${EOS_PATHS.l10}#rocks`} className="btn-link">
            {canEdit ? "Set and mark Rocks in the L10" : "See Rocks in the L10"}
          </Link>
        </p>
      </div>
    );
  }

  const parked = items
    .filter(
      (row) =>
        row.kind === "issue" && row.status === "open" && row.parkedAt != null,
    )
    .sort((a, b) => (a.parkedAt ?? 0) - (b.parkedAt ?? 0));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    void run(async () => {
      const created = (await addItem({ kind: "issue", title })) as {
        docId: string;
      };
      await park({ docId: created.docId, version: 1 });
    }).then((ok) => {
      if (ok) setDraft("");
    });
  };

  return (
    <div className="grid gap-2">
      {banner}
      {parked.length === 0 ? (
        <p className="text-sm text-ink-3">
          No long-term issues. Park an issue from the L10 when it can wait for
          the quarterly meeting.
        </p>
      ) : (
        <ol className="eos-list">
          {parked.map((row, index) => (
            <li key={row._id} className="eos-list-row">
              <span className="eos-list-index">{index + 1}</span>
              <span className="min-w-0 pt-1 text-base text-ink">
                {row.title}
              </span>
              {canEdit ? (
                <div className="eos-row-tools">
                  <button
                    type="button"
                    className="btn-link btn-link-compact"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        bringBack({ docId: row._id, version: row.version }),
                      )
                    }
                  >
                    To this week's L10
                  </button>
                  <button
                    type="button"
                    className="eos-icon-btn"
                    aria-label={`Drop: ${row.title}`}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        drop({ docId: row._id, version: row.version }),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ol>
      )}
      {canEdit ? (
        <form className="eos-add" onSubmit={submit}>
          <input
            className="input"
            aria-label="Add a long-term issue"
            placeholder="Add a long-term issue"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            className="btn btn-secondary"
            disabled={busy || !draft.trim()}
          >
            Add
          </button>
        </form>
      ) : null}
    </div>
  );
}
