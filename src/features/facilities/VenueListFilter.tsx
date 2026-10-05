import { NO_VENUE_FILTER, type VenueFilter } from "./venueOperatingFacts";

type Props = {
  readonly filter: VenueFilter;
  readonly onChange: (next: VenueFilter) => void;
  readonly shown: number;
  readonly total: number;
};

/** Find a venue that fits: guests, on/off premise, oven, fridge, parking. */
export function VenueListFilter({ filter, onChange, shown, total }: Props) {
  const set = (patch: Partial<VenueFilter>) =>
    onChange({ ...filter, ...patch });
  const active =
    filter.minGuests != null ||
    filter.premise !== "any" ||
    filter.needsOven ||
    filter.needsFridge ||
    filter.needsParking;
  return (
    <div
      className="flex flex-wrap items-end gap-4 rounded-sm bg-inset p-3 text-xs"
      data-testid="venue-list-filter"
    >
      <label className="block text-ink-2">
        Holds at least
        <input
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          aria-label="Holds at least this many guests"
          value={filter.minGuests ?? ""}
          onChange={(event) => {
            const value = event.target.value.trim();
            set({
              minGuests: value === "" ? null : Math.max(0, Number(value)),
            });
          }}
          className="mt-1 block w-24 rounded-sm border-line-2"
          placeholder="Guests"
        />
      </label>
      <label className="block text-ink-2">
        Kind
        <select
          value={filter.premise}
          onChange={(event) =>
            set({ premise: event.target.value as VenueFilter["premise"] })
          }
          className="mt-1 block rounded-sm border-line-2"
        >
          <option value="any">Any</option>
          <option value="on">On-premise</option>
          <option value="off">Off-premise</option>
        </select>
      </label>
      {(
        [
          ["needsOven", "Has an oven"],
          ["needsFridge", "Has a fridge"],
          ["needsParking", "Has parking"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex items-center gap-1 text-ink-2">
          <input
            type="checkbox"
            checked={filter[key]}
            onChange={(event) => set({ [key]: event.target.checked })}
          />
          {label}
        </label>
      ))}
      {active && (
        <>
          <span className="text-ink-3">
            {shown} of {total} venues
          </span>
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={() => onChange(NO_VENUE_FILTER)}
          >
            Clear
          </button>
        </>
      )}
    </div>
  );
}
