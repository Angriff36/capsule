import { useState } from "react";
import {
  useLeadershipItemComplete,
  useLeadershipItemDrop,
  useLeadershipItemMarkTrack,
  useLeadershipItemReopen,
  useLeadershipItemSolve,
} from "@/lib/manifest-convex-react";
import {
  ROCK_TRACK_LABEL,
  type LeadershipItemRow,
  type RockTrack,
} from "./leadershipHistory";

type Run = (work: () => Promise<unknown>) => Promise<boolean>;

const TRACKS = Object.keys(ROCK_TRACK_LABEL) as RockTrack[];

/** This week's on track / at risk / off track mark on an open priority. */
export function RockTrackPicker({
  row,
  busy,
  run,
}: {
  row: LeadershipItemRow;
  busy: boolean;
  run: Run;
}) {
  const markTrack = useLeadershipItemMarkTrack();
  if (row.status !== "open") {
    return <>{row.track ? ROCK_TRACK_LABEL[row.track] : "—"}</>;
  }
  return (
    <select
      className="input"
      aria-label={`This week: ${row.title}`}
      value={row.track ?? ""}
      disabled={busy}
      onChange={(event) => {
        const track = event.target.value as RockTrack;
        if (!track) return;
        void run(() =>
          markTrack({ docId: row._id, version: row.version, track }),
        );
      }}
    >
      <option value="">Not marked</option>
      {TRACKS.map((track) => (
        <option key={track} value={track}>
          {ROCK_TRACK_LABEL[track]}
        </option>
      ))}
    </select>
  );
}

/**
 * Done / Drop / Reopen for every item. An open issue is solved instead of
 * just closed: the team writes the answer they agreed on. A headline is
 * marked "Heard" once read out.
 */
export function LeadershipItemActions({
  row,
  busy,
  run,
}: {
  row: LeadershipItemRow;
  busy: boolean;
  run: Run;
}) {
  const completeItem = useLeadershipItemComplete();
  const dropItem = useLeadershipItemDrop();
  const reopenItem = useLeadershipItemReopen();
  const solveItem = useLeadershipItemSolve();
  const [solving, setSolving] = useState(false);
  const [answer, setAnswer] = useState("");
  const ref = { docId: row._id, version: row.version };
  const isHeadline =
    row.kind === "client_headline" || row.kind === "people_headline";

  if (row.status !== "open") {
    return (
      <button
        type="button"
        className="btn-link btn-link-compact"
        disabled={busy}
        onClick={() => void run(() => reopenItem(ref))}
      >
        Reopen
      </button>
    );
  }

  if (solving) {
    return (
      <form
        className="flex flex-wrap items-center justify-end gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => solveItem({ ...ref, solution: answer })).then((ok) => {
            if (ok) setSolving(false);
          });
        }}
      >
        <input
          className="input"
          aria-label={`Agreed answer: ${row.title}`}
          placeholder="The answer we agreed on"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          required
          autoFocus
        />
        <button className="btn btn-secondary" disabled={busy}>
          Save
        </button>
        <button
          type="button"
          className="btn-link btn-link-compact text-ink-2"
          onClick={() => setSolving(false)}
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <>
      {row.kind === "issue" ? (
        <button
          type="button"
          className="btn-link btn-link-compact"
          disabled={busy}
          onClick={() => setSolving(true)}
        >
          Solve
        </button>
      ) : (
        <button
          type="button"
          className="btn-link btn-link-compact"
          disabled={busy}
          onClick={() => void run(() => completeItem(ref))}
        >
          {isHeadline ? "Heard" : "Done"}
        </button>
      )}{" "}
      <button
        type="button"
        className="btn-link btn-link-compact text-ink-2"
        disabled={busy}
        onClick={() => void run(() => dropItem(ref))}
      >
        Drop
      </button>
    </>
  );
}
