import { formatDate, formatTime } from "../../lib/format";
import type { BattleBoardTaskTemplate } from "./battleBoardTaskTemplates";
import { EventTimelineTemplatesMenu } from "./EventTimelineTemplatesMenu";
import { formatSpan } from "./EventTimelineSidebar";

type Props = {
  readonly windowStart: number | null;
  readonly windowEnd: number | null;
  readonly blockCount: number;
  readonly disabled: boolean;
  readonly onPickTemplate: (template: BattleBoardTaskTemplate) => void;
};

/** Run-sheet masthead: the day, the window it covers, and the template menu. */
export function EventTimelineRunSheetHeader({
  windowStart,
  windowEnd,
  blockCount,
  disabled,
  onPickTemplate,
}: Props) {
  return (
    <section className="card p-5" aria-label="Run sheet">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-ink">Event run sheet</h3>
          <p className="mt-1 text-sm text-ink-3">
            {windowStart == null
              ? "No blocks scheduled yet"
              : `${formatDate(windowStart)} · ${formatTime(windowStart)}${
                  windowEnd == null
                    ? ""
                    : ` – ${formatTime(windowEnd)} · ${formatSpan(
                        windowStart,
                        windowEnd,
                      )}`
                }`}
          </p>
          <p className="mt-1 font-mono text-xs text-ink-3">
            {blockCount} {blockCount === 1 ? "block" : "blocks"}
          </p>
        </div>
        <EventTimelineTemplatesMenu
          disabled={disabled}
          onPick={onPickTemplate}
        />
      </div>
    </section>
  );
}
