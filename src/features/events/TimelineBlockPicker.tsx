import { useEffect, useId, useRef, useState } from "react";
import {
  BATTLE_BOARD_TASK_TEMPLATES,
  BATTLE_BOARD_TASK_TEMPLATE_GROUPS,
  type BattleBoardTaskTemplate,
} from "./battleBoardTaskTemplates";

type Props = {
  existing: readonly { name?: string | null; category?: string | null }[];
  busy: boolean;
  onAdd: (templates: BattleBoardTaskTemplate[]) => void;
  onCancel: () => void;
};

/** Choose the work this event needs before adding it to the shared run. */
export function TimelineBlockPicker({
  existing,
  busy,
  onAdd,
  onCancel,
}: Props) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const keyOf = (template: BattleBoardTaskTemplate) =>
    `${template.group}:${template.label}`;
  const alreadyAdded = (template: BattleBoardTaskTemplate) =>
    existing.some(
      (row) =>
        row.name?.trim().toLowerCase() === template.label.toLowerCase() &&
        (row.category ?? "").trim().toLowerCase() ===
          template.category.toLowerCase(),
    );
  const available = BATTLE_BOARD_TASK_TEMPLATES.filter(
    (template) => !alreadyAdded(template),
  );
  const chosen = available.filter((template) => selected.has(keyOf(template)));

  return (
    <section className="timeline-block-picker" aria-labelledby={titleId}>
      <h2
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        className="text-xl font-semibold"
      >
        Choose run-of-show blocks
      </h2>
      <p className="mt-2 text-base text-ink-2">
        Add the work this event needs. Times stay blank until planned; crew can
        still mark work done.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onAdd(chosen);
        }}
      >
        <fieldset disabled={busy}>
          <legend className="sr-only">Standard event work</legend>
          <div className="timeline-block-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={chosen.length === 0}
            >
              {busy
                ? "Adding…"
                : `Add ${chosen.length} ${chosen.length === 1 ? "block" : "blocks"}`}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <label className="flex min-h-10 w-full items-center gap-3 text-base">
              <input
                type="checkbox"
                className="size-5 accent-brand"
                checked={
                  available.length > 0 && chosen.length === available.length
                }
                disabled={available.length === 0}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? new Set(available.map(keyOf))
                      : new Set(),
                  )
                }
              />
              Select all available blocks
            </label>
          </div>
          {BATTLE_BOARD_TASK_TEMPLATE_GROUPS.map((group) => (
            <fieldset key={group} className="mt-4">
              <legend className="text-sm font-semibold text-ink-2">
                {group}
              </legend>
              <div className="timeline-block-options">
                {BATTLE_BOARD_TASK_TEMPLATES.filter(
                  (template) => template.group === group,
                ).map((template) => {
                  const added = alreadyAdded(template);
                  return (
                    <label
                      key={keyOf(template)}
                      className="flex min-h-11 items-start gap-3 border-b border-line py-3"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-5 shrink-0 accent-brand"
                        checked={added || selected.has(keyOf(template))}
                        disabled={added}
                        onChange={(event) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(keyOf(template));
                            else next.delete(keyOf(template));
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0">
                        <span className="block text-base font-medium">
                          {template.label}
                          {added ? " · Already on this run" : ""}
                        </span>
                        <span className="block text-sm text-ink-2">
                          {template.defaultTeam} · {template.notes}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </fieldset>
      </form>
    </section>
  );
}
