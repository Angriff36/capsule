import { useEffect, useId, useRef, useState } from "react";
import {
  BATTLE_BOARD_TASK_TEMPLATES,
  BATTLE_BOARD_TASK_TEMPLATE_GROUPS,
  type BattleBoardTaskTemplate,
} from "./battleBoardTaskTemplates";

type Props = {
  readonly disabled?: boolean;
  readonly onPick: (template: BattleBoardTaskTemplate) => void;
};

/** Templates dropdown that adds a run-of-show block to the event timeline. */
export function EventTimelineTemplatesMenu({ disabled, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="btn btn-ghost min-h-10"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        Templates
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-20 mt-1 max-h-80 w-72 overflow-y-auto rounded-sm border border-line-2 bg-panel p-2 shadow-md"
        >
          {BATTLE_BOARD_TASK_TEMPLATE_GROUPS.map((group) => (
            <div key={group} className="mb-2 last:mb-0">
              <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
                {group}
              </p>
              <ul>
                {BATTLE_BOARD_TASK_TEMPLATES.filter(
                  (template) => template.group === group,
                ).map((template) => (
                  <li key={`${template.group}:${template.label}`}>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full rounded-xs px-2 py-1.5 text-left text-base text-ink hover:bg-inset"
                      onClick={() => {
                        onPick(template);
                        setOpen(false);
                      }}
                    >
                      <span className="block font-medium">
                        {template.label}
                      </span>
                      {template.defaultTeam ? (
                        <span className="block text-xs text-ink-3">
                          {template.defaultTeam}
                          {template.notes ? ` · ${template.notes}` : ""}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
