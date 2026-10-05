import { useState, type FormEvent } from "react";
import type { Id } from "../../lib/api";
import { formatMoneyExact } from "../../lib/format";
import { useEventSetTravelFee } from "../../lib/manifest-convex-react";
import { useEventTravelFee } from "../../lib/useTravelFee";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";

const blankOr = (value: FormDataEntryValue | null) => {
  const text = String(value ?? "").trim();
  return text === "" ? undefined : Math.max(0, Number(text) || 0);
};

/**
 * Travel & delivery fee for this event: the company rule applied to the
 * kitchen-to-venue distance. A person can type the distance (when there is
 * no drive time) or set this event's own fee; blank goes back to the rule.
 */
export function EventTravelFeePanel({ eventId }: { eventId: Id<"events"> }) {
  const fee = useEventTravelFee(eventId);
  const setTravelFee = useEventSetTravelFee();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [saved, setSaved] = useState(false);

  if (!fee) return null;
  if (fee.rule.mode === "off" && fee.overrideFee == null) return null;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const overrideAmount = blankOr(data.get("overrideAmount"));
    setBusy(true);
    setFailure(null);
    setSaved(false);
    try {
      await setTravelFee({
        docId: eventId,
        version: fee.eventVersion,
        distanceMiles: blankOr(data.get("distanceMiles")),
        overrideAmount,
        overrideReason:
          overrideAmount != null
            ? String(data.get("overrideReason") ?? "").trim() || undefined
            : undefined,
      });
      setSaved(true);
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(false);
    }
  };

  const distance =
    fee.distanceMiles == null
      ? "No distance yet. Get the drive time above, or type the miles."
      : `${fee.distanceMiles} mi each way${
          fee.distanceSource === "route" ? " (from the drive time)" : ""
        }${fee.rule.roundTrip ? ", charged there and back" : ""}.`;

  return (
    <div
      className="mt-4 rounded-md border border-line p-4"
      aria-label="Travel fee"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Travel & delivery fee</h3>
        <p className="text-lg font-semibold" data-testid="event-travel-fee">
          {formatMoneyExact(fee.fee)}
        </p>
      </div>
      <p className="mt-2 text-base text-ink-2">
        {distance}
        {fee.overrideFee != null
          ? ` Set for this event; the company rule gives ${formatMoneyExact(fee.computedFee)}.`
          : ""}
      </p>
      <form
        key={fee.eventVersion}
        className="mt-3 grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => void save(e)}
      >
        <label className="field-label">
          <span>Miles each way</span>
          <input
            className="input min-h-10"
            name="distanceMiles"
            type="number"
            min={0}
            step="0.1"
            placeholder={
              fee.distanceSource === "route" ? String(fee.distanceMiles) : ""
            }
            defaultValue={
              fee.distanceSource === "typed" ? String(fee.distanceMiles) : ""
            }
            disabled={busy}
          />
        </label>
        <label className="field-label">
          <span>This event&apos;s fee ($)</span>
          <input
            className="input min-h-10"
            name="overrideAmount"
            type="number"
            min={0}
            step="0.01"
            placeholder={String(fee.computedFee)}
            defaultValue={
              fee.overrideFee == null ? "" : String(fee.overrideFee)
            }
            disabled={busy}
          />
        </label>
        <label className="field-label">
          <span>Why (optional)</span>
          <input
            className="input min-h-10"
            name="overrideReason"
            defaultValue={fee.overrideReason ?? ""}
            placeholder="Repeat client, no travel fee"
            disabled={busy}
          />
        </label>
        <div className="sm:col-span-3">
          <button
            type="submit"
            className="btn btn-ghost min-h-10"
            disabled={busy}
          >
            {busy ? "Saving…" : "Save travel fee"}
          </button>
          <span className="ml-3 text-sm text-ink-3">
            Leave a box empty to use the drive time and the company rule.
          </span>
        </div>
      </form>
      {failure && (
        <div className="mt-3">
          <FailureBanner failure={failure} />
        </div>
      )}
      {saved && (
        <p role="status" className="mt-3 text-base text-success">
          Travel fee saved. Update the travel line on a draft proposal to use
          it.
        </p>
      )}
    </div>
  );
}
