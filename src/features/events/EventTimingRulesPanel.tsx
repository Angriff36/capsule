import { useState } from "react";
import { Link } from "react-router-dom";
import type { Id } from "../../lib/api";
import { useEventUseCompanyTimingRule } from "../../lib/manifest-convex-react";
import { useEventTimingRules } from "../../lib/useEventTimingRules";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";
import { timeLabel } from "./EventTimingPlannerDraft";

type Rules = NonNullable<ReturnType<typeof useEventTimingRules>>;
type Part = Rules["setup"];

const minutes = (value: number | null) =>
  value == null ? "not set" : `${value} min`;

function personLine(part: Part) {
  if (part.source !== "person") return null;
  const who = part.overrideBy ?? "Someone";
  const when = part.overrideAt ? ` on ${timeLabel(part.overrideAt)}` : "";
  const why = part.overrideReason
    ? `: ${part.overrideReason}`
    : " (no reason given)";
  return `Changed by ${who}${when}${why}`;
}

/**
 * What the company timing rules give for this event next to what the event
 * uses (spec §8.4, PL-TIMING). A time someone changed shows who and why,
 * with a button to go back to the company rule.
 */
export function EventTimingRulesPanel({
  eventId,
  version,
  canChange,
}: {
  eventId: Id<"events">;
  version: number;
  canChange: boolean;
}) {
  const rules = useEventTimingRules(eventId);
  const restoreRule = useEventUseCompanyTimingRule();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  if (!rules) return null;

  const backToRule = async (setup: boolean, load: boolean) => {
    setBusy(true);
    setFailure(null);
    try {
      await restoreRule({ docId: eventId, version, setup, load });
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(false);
    }
  };

  const setupRule =
    rules.setup.ruleMinutes == null
      ? `no company setup rule for ${rules.serviceStyleName ?? "this service style"}`
      : `company rule ${rules.setup.ruleMinutes} min`;
  const loadRule = rules.load.ruleLabel
    ? `company rule "${rules.load.ruleLabel}" ${rules.load.ruleMinutes} min`
    : `standard load time ${rules.load.ruleMinutes} min`;

  return (
    <div className="card mt-4 p-4" aria-label="Company timing rules">
      <h3 className="text-base font-semibold">Setup, load and briefing</h3>
      <ul className="mt-2 space-y-3 text-base">
        <li>
          <p>
            Setup before service: {minutes(rules.setup.minutes)}{" "}
            <span className="text-ink-2">({setupRule})</span>
          </p>
          {personLine(rules.setup) && (
            <p className="text-sm text-ink-2">{personLine(rules.setup)}</p>
          )}
          {canChange && rules.setup.source === "person" && (
            <button
              type="button"
              className="btn btn-ghost mt-1 min-h-10"
              disabled={busy}
              onClick={() => void backToRule(true, false)}
            >
              Use company rule
            </button>
          )}
        </li>
        <li>
          <p>
            Load at the kitchen: {minutes(rules.load.minutes)}{" "}
            <span className="text-ink-2">({loadRule})</span>
          </p>
          {rules.load.needsReview && (
            <p className="text-sm text-warn">
              No load rule fits this event ({rules.guestCount ?? "unknown"}{" "}
              guests, {rules.packItemCount} pack list lines,{" "}
              {rules.vehicleCount} trucks), so the standard load time is used.
              Check it.
            </p>
          )}
          {personLine(rules.load) && (
            <p className="text-sm text-ink-2">{personLine(rules.load)}</p>
          )}
          {canChange && rules.load.source === "person" && (
            <button
              type="button"
              className="btn btn-ghost mt-1 min-h-10"
              disabled={busy}
              onClick={() => void backToRule(false, true)}
            >
              Use company rule
            </button>
          )}
        </li>
        <li className="text-ink-2">
          Crew briefing before loading: {rules.briefingMinutes} min · Spare
          minutes before leaving: {rules.safetyBufferMinutes} min.{" "}
          <Link className="text-link" to="/admin/kitchens">
            Company timing rules
          </Link>
        </li>
      </ul>
      {failure && (
        <div className="mt-3">
          <FailureBanner failure={failure} />
        </div>
      )}
    </div>
  );
}
