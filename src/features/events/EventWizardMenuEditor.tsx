import { useEffect, useState } from "react";
import { formatMoney } from "../../lib/format";
import type {
  EventWizardDish,
  EventWizardDraft,
} from "./eventCreateWizardModel";

const KIND_LABELS: Record<string, string> = {
  supply: "Supply",
  service: "Service",
  package: "Package",
};

/** Packages, supplies and services are named in the dish picker; food is plain. */
export function dishKindLabel(kind: unknown): string | null {
  return typeof kind === "string" ? (KIND_LABELS[kind] ?? null) : null;
}

/** One dish on the event: its servings and kitchen notes can change before create. */
export function WizardDishLineFields({
  line,
  headcount,
  locked,
  onChange,
}: {
  line: EventWizardDish;
  headcount: string;
  locked: boolean;
  onChange: (changes: Partial<EventWizardDish>) => void;
}) {
  const guests = Number(headcount);
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr]">
      <label className="field-label">
        Servings
        <input
          className="field-input"
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={line.servings ?? ""}
          disabled={locked}
          placeholder={guests > 0 ? String(guests) : "Headcount"}
          onChange={(event) => onChange({ servings: event.target.value })}
        />
      </label>
      <label className="field-label">
        Notes for the kitchen
        <input
          className="field-input"
          value={line.notes ?? ""}
          disabled={locked}
          placeholder="Changes, plating, allergies…"
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </label>
    </div>
  );
}

/** The event price, set here as a price per guest or as a total. */
export function WizardMenuPrice({
  draft,
  locked,
  update,
}: {
  draft: EventWizardDraft;
  locked: boolean;
  update: (changes: Partial<EventWizardDraft>) => void;
}) {
  const guests = Number(draft.expectedHeadcount);
  const total = Number(draft.quotedPrice);
  const derived =
    guests > 0 && total > 0
      ? String(Math.round((total / guests) * 100) / 100)
      : "";
  // Typed text stays as typed; a new total from elsewhere refreshes it.
  const [perGuest, setPerGuest] = useState(derived);
  useEffect(() => {
    setPerGuest((current) =>
      guests > 0 && Math.abs(Number(current) * guests - total) < 0.01
        ? current
        : derived,
    );
  }, [derived, guests, total]);
  return (
    <div className="border-t border-line pt-3" data-testid="wizard-menu-price">
      <p className="text-sm font-semibold text-ink">Price</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="field-label">
          Price per guest
          <input
            className="field-input"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={perGuest}
            disabled={locked || !(guests > 0)}
            onChange={(event) => {
              const value = event.target.value;
              setPerGuest(value);
              const price = Number(value);
              if (value.trim() && Number.isFinite(price) && price >= 0)
                update({
                  quotedPrice: String(Math.round(price * guests * 100) / 100),
                });
            }}
          />
        </label>
        <label className="field-label">
          Quoted price (total)
          <input
            className="field-input"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={draft.quotedPrice}
            disabled={locked}
            onChange={(event) => update({ quotedPrice: event.target.value })}
          />
        </label>
      </div>
      <p className="mt-1 text-sm text-ink-3">
        {guests > 0
          ? `${guests} guests · ${formatMoney(Number.isFinite(total) ? total : 0)} total`
          : "Enter the headcount on Client & headcount to price per guest."}
      </p>
    </div>
  );
}
