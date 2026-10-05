import type { FormEvent } from "react";
import {
  AUTO_STAGE_MOVES,
  byHandJson,
  DEFAULT_BY_HAND,
  parseByHand,
  type AutoStage,
} from "../../../lib/eventStageMoves";
import { useOrganizationConfigureStageMoves } from "../../../lib/manifest-convex-react";
import { TableSkeleton } from "../../../ui/primitives";

type Props = {
  readonly organization:
    | { _id: string; version?: number; stageMovesByHandJson?: string | null }
    | undefined;
  readonly loading: boolean;
  readonly canEdit: boolean;
  readonly busy: string | null;
  readonly run: (
    key: string,
    work: () => Promise<unknown>,
    ok: string,
  ) => Promise<boolean>;
};

/**
 * Which event stages move on by themselves and which stay a person's step
 * (site comment #421).
 */
export function StageMovesSection({
  organization,
  loading,
  canEdit,
  busy,
  run,
}: Props) {
  const save = useOrganizationConfigureStageMoves();
  const byHand = parseByHand(organization?.stageMovesByHandJson);

  const submit = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!organization) return;
    const data = new FormData(formEvent.currentTarget);
    const chosen = AUTO_STAGE_MOVES.map((move) => move.to).filter(
      (stage) => data.get(stage) === "hand",
    );
    void run(
      "stages",
      () =>
        save({
          docId: organization._id,
          version: organization.version,
          byHandJson: byHandJson(chosen),
        }),
      "Stage moves saved",
    );
  };

  return (
    <section className="mt-10" aria-label="Stage moves" id="stage-moves">
      <div className="section-rule">
        <span>Stage moves</span>
        <i />
        <em>By itself or by hand</em>
      </div>
      <p className="mt-2 max-w-[72ch] text-base text-ink-2">
        An event moves to its next stage by itself as soon as that stage’s
        conditions are met. Pick “By hand” for a stage your team wants to move
        an event into themselves; the event then waits there for a person.
      </p>
      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <form
          key={organization?.stageMovesByHandJson ?? "defaults"}
          onSubmit={submit}
        >
          <div className="supply-table-wrap mt-3">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Moves on by itself when</th>
                  <th>How</th>
                </tr>
              </thead>
              <tbody>
                {AUTO_STAGE_MOVES.map((move) => (
                  <tr key={move.to}>
                    <td>
                      <strong>{move.label}</strong>
                    </td>
                    <td>{move.when}</td>
                    <td>
                      <select
                        name={move.to}
                        className="input"
                        aria-label={`How events move to ${move.label}`}
                        defaultValue={byHand.has(move.to) ? "hand" : "auto"}
                        disabled={!canEdit}
                      >
                        <option value="auto">
                          By itself{usual(move.to, false)}
                        </option>
                        <option value="hand">
                          By hand{usual(move.to, true)}
                        </option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit ? (
            <button
              type="submit"
              className="btn btn-primary mt-3"
              disabled={busy != null || !organization}
            >
              {busy === "stages" ? "Saving…" : "Save stage moves"}
            </button>
          ) : (
            <p className="mt-2 text-sm text-ink-2">
              A manager can change these.
            </p>
          )}
        </form>
      )}
    </section>
  );
}

function usual(stage: AutoStage, byHand: boolean): string {
  return DEFAULT_BY_HAND.includes(stage) === byHand ? " (usual)" : "";
}
