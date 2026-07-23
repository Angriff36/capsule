import type { KitchenCommandDeckModel } from "./KitchenCommandDeckModel";
import { KitchenCommandDeckPersonLabel } from "./KitchenCommandDeckPersonLabel";
import type { CrewLoadRow, PersonLike } from "./KitchenCommandDeckTypes";

type Props = Readonly<{
  model: KitchenCommandDeckModel;
  rows: CrewLoadRow[];
  people: PersonLike[];
  armedPersonId: string | null;
  onArm: (personId: string | null) => void;
}>;

export function KitchenCommandDeckCrewRail({
  model,
  rows,
  people,
  armedPersonId,
  onArm,
}: Props) {
  const maxLoad = Math.max(1, ...rows.map((r) => r.load), 1);
  const activePeople = people.filter((p) => p.deletedAt == null);

  return (
    <div data-testid="command-deck-crew-rail">
      <h2 className="kcd-rail-title">Crew load</h2>
      {rows.length === 0 ? (
        <p className="kcd-empty">
          Nobody has prep yet. Arm a cook below, then assign tasks.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {rows.map((row, index) => (
            <li
              key={row.person._id}
              className="kcd-crew-card"
              style={{ ["--delay" as string]: `${index * 40}ms` }}
            >
              <div className="kcd-crew-top">
                <span className="kcd-avatar" aria-hidden="true">
                  {KitchenCommandDeckPersonLabel.initials(row.person)}
                </span>
                <div className="min-w-0">
                  <div className="kcd-crew-name">
                    {model.personLabel(row.person)}
                  </div>
                  <div className="kcd-crew-stats">
                    {row.inProgress} doing · {row.claimed} claimed ·{" "}
                    {row.completed} done
                  </div>
                </div>
                <span className="kcd-crew-load">{row.load} open</span>
              </div>
              <div className="kcd-progress" aria-hidden="true">
                <i
                  style={{
                    width: `${Math.round((row.load / maxLoad) * 100)}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="kcd-assign-panel">
        <h2 className="kcd-rail-title">Quick assign</h2>
        <p className="kcd-assign-help">
          Tap a cook, then assign a step — or assign a whole dish.
        </p>
        <div className="kcd-cook-picks">
          {activePeople.map((person) => {
            const armed = armedPersonId === person._id;
            return (
              <button
                key={person._id}
                type="button"
                className={`kcd-cook-pick${armed ? " is-armed" : ""}`}
                onClick={() => onArm(armed ? null : person._id)}
              >
                <span className="kcd-avatar" aria-hidden="true">
                  {KitchenCommandDeckPersonLabel.initials(person)}
                </span>
                {KitchenCommandDeckPersonLabel.first(person)}
              </button>
            );
          })}
        </div>
        {armedPersonId ? (
          <p className="kcd-armed-banner">
            Armed: {model.personLabel(model.findPerson(armedPersonId))} — click
            Assign on a task or dish.
          </p>
        ) : null}
      </div>
    </div>
  );
}
