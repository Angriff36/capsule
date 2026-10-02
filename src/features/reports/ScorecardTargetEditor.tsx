import { useState, type FormEvent } from "react";
import {
  useCreateScorecardTarget,
  useScorecardTargetRetire,
  useScorecardTargetRevise,
} from "@/lib/manifest-convex-react";
import type {
  ScorecardDirection,
  ScorecardMeasure,
  ScorecardTargetRow,
} from "./scorecardMeasures";
import { ReportsFailureBanner } from "./ReportsFailureBanner";

export interface ScorecardPerson {
  readonly _id: string;
  readonly givenName: string;
  readonly familyName: string;
}

/**
 * Set, change or take off the target and owner for one scorecard number.
 * The first save makes the target; later saves change it in place.
 */
export function ScorecardTargetEditor({
  measure,
  target,
  people,
  onDone,
}: {
  measure: ScorecardMeasure;
  target: ScorecardTargetRow | undefined;
  people: readonly ScorecardPerson[];
  onDone: () => void;
}) {
  const createTarget = useCreateScorecardTarget();
  const reviseTarget = useScorecardTargetRevise();
  const retireTarget = useScorecardTargetRetire();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const run = (work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(true);
    void (async () => {
      try {
        await work();
        onDone();
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = Number(data.get("target"));
    const direction = String(data.get("direction")) as ScorecardDirection;
    const ownerPersonId = String(data.get("ownerPersonId") || "") || undefined;
    const notes = String(data.get("notes") || "") || undefined;
    run(() =>
      target
        ? reviseTarget({
            docId: target._id,
            version: target.version,
            target: value,
            direction,
            ownerPersonId,
            notes,
          })
        : createTarget({
            metricKey: measure.key,
            target: value,
            direction,
            ownerPersonId,
            notes,
          }),
    );
  };

  return (
    <form className="mt-3 grid gap-2" onSubmit={submit}>
      {failure ? <ReportsFailureBanner error={failure} /> : null}
      <label className="field-label">
        Target{measure.unit === "percent" ? " (%)" : ""}
        <input
          name="target"
          type="number"
          min={0}
          step={measure.unit === "count" ? 1 : 0.01}
          className="input"
          defaultValue={target?.target ?? ""}
          required
        />
      </label>
      <label className="field-label">
        Good when the number is
        <select
          name="direction"
          className="input"
          defaultValue={target?.direction ?? measure.direction}
        >
          <option value="higher_better">At or above the target</option>
          <option value="lower_better">At or below the target</option>
        </select>
      </label>
      <label className="field-label">
        Owner
        <select
          name="ownerPersonId"
          className="input"
          defaultValue={target?.ownerPersonId ?? ""}
        >
          <option value="">No owner</option>
          {people.map((person) => (
            <option key={person._id} value={person._id}>
              {`${person.givenName} ${person.familyName}`.trim()}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        Note (optional)
        <input
          name="notes"
          className="input"
          defaultValue={target?.notes ?? ""}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save target"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onDone}
          disabled={busy}
        >
          Cancel
        </button>
        {target ? (
          <button
            type="button"
            className="btn-link"
            disabled={busy}
            onClick={() =>
              run(() =>
                retireTarget({ docId: target._id, version: target.version }),
              )
            }
          >
            Remove target
          </button>
        ) : null}
      </div>
    </form>
  );
}
