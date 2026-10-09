import { useState } from "react";
import type { Id } from "../../lib/api";
import { useEventSetUpsellPotential } from "../../lib/manifest-convex-react";
import { Section } from "../../ui/primitives";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";

export type UpsellPotential = "high" | "moderate" | "standard";

/**
 * The owner's Avg Event Value Growth Strategy, "Pipeline Tagging": while a
 * deal is being sold, sales tag how much it can grow with add-ons. The
 * Average Event Value page groups open deals by this tag.
 */
export const UPSELL_POTENTIAL: Record<
  UpsellPotential,
  { label: string; when: string; range: string; action: string }
> = {
  high: {
    label: "High",
    when: "Wedding, gala or milestone; room in the budget; the client wants it special.",
    range: "+$1,500 to $5,000",
    action: "Offer three tiers and suggest add-ons one at a time.",
  },
  moderate: {
    label: "Moderate",
    when: "Corporate event, repeat client or a larger guest count.",
    range: "+$500 to $1,500",
    action: "Suggest one or two add-ons that fit the event.",
  },
  standard: {
    label: "Standard",
    when: "Tight budget, first-time client or a small event.",
    range: "+$100 to $500",
    action: "One natural add-on. Don't push.",
  },
};

const ORDER: UpsellPotential[] = ["high", "moderate", "standard"];
const SOLD = ["completed", "closed_out", "cancelled"];

export function EventUpsellPotentialCard({
  eventId,
  stage,
  potential,
}: {
  readonly eventId: Id<"events">;
  readonly stage: string;
  readonly potential: UpsellPotential | null | undefined;
}) {
  const setPotential = useEventSetUpsellPotential();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  if (SOLD.includes(stage)) return null;

  const save = async (next: UpsellPotential | null) => {
    setBusy(true);
    setFailure(null);
    try {
      await setPotential({ docId: eventId, potential: next ?? undefined });
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(false);
    }
  };

  const picked = potential ? UPSELL_POTENTIAL[potential] : null;
  return (
    <Section title="Add-on potential">
      <div className="space-y-3 p-4" data-testid="event-upsell-potential">
        <p className="text-sm text-ink-2">
          {picked
            ? `${picked.label}: usually ${picked.range}. ${picked.action}`
            : "How much could this event grow with add-ons (bar, stations, late night, dessert, service, extras)?"}
        </p>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Add-on potential"
        >
          {ORDER.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={potential === key}
              title={UPSELL_POTENTIAL[key].when}
              className={
                potential === key ? "btn btn-primary" : "btn btn-ghost"
              }
              disabled={busy}
              onClick={() => void save(key)}
            >
              {UPSELL_POTENTIAL[key].label}
            </button>
          ))}
          {potential ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void save(null)}
            >
              Clear
            </button>
          ) : null}
        </div>
        <ul className="list-disc pl-5 text-xs text-ink-2">
          {ORDER.map((key) => (
            <li key={key}>
              <strong className="text-ink">
                {UPSELL_POTENTIAL[key].label}
              </strong>
              : {UPSELL_POTENTIAL[key].when}
            </li>
          ))}
        </ul>
        {failure ? (
          <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
        ) : null}
      </div>
    </Section>
  );
}
