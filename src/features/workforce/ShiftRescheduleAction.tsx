import { useShiftReschedule } from "../../lib/manifest-convex-react";
import type { ActionPromptSession } from "../../ui/action-prompt";
import { localDateTime } from "../events/eventDetailFormHelpers";

/**
 * Move a scheduled shift's window on the roster. Runs the governed
 * Shift.reschedule command, which only accepts a shift that is still
 * scheduled — started, completed and cancelled shifts keep their times.
 */

const toEpoch = (value: string | undefined) => {
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
};

export function ShiftRescheduleAction({
  shift,
  prompt,
  busy,
  run,
}: Readonly<{
  shift: {
    _id: string;
    version?: number;
    status?: unknown;
    startsAt?: number | null;
    endsAt?: number | null;
  };
  prompt: ActionPromptSession;
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => Promise<void>;
}>) {
  const reschedule = useShiftReschedule();
  if (String(shift.status) !== "scheduled") return null;
  const key = `${shift._id}:reschedule`;

  const onClick = () => {
    void (async () => {
      const values = await prompt.askFields({
        title: "Edit shift time",
        description: "Move this scheduled shift to a new window.",
        fields: [
          {
            name: "startsAt",
            label: "Starts",
            inputType: "datetime-local",
            defaultValue: localDateTime(shift.startsAt),
            required: true,
          },
          {
            name: "endsAt",
            label: "Ends",
            inputType: "datetime-local",
            defaultValue: localDateTime(shift.endsAt),
            required: true,
          },
        ],
        confirmLabel: "Save new time",
      });
      if (!values) return;
      const startsAt = toEpoch(values.startsAt);
      const endsAt = toEpoch(values.endsAt);
      await run(key, async () => {
        if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
          throw new Error("Enter a start and an end for the shift.");
        }
        await reschedule({
          docId: shift._id,
          version: shift.version,
          startsAt,
          endsAt,
        });
      });
    })();
  };

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={busy != null}
      onClick={onClick}
    >
      {busy === key ? "Working…" : "Edit time"}
    </button>
  );
}
