import type { CommandDeckFilter } from "./KitchenCommandDeckTypes";

const FILTERS: { id: CommandDeckFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "kitchen", label: "Kitchen finish" },
  { id: "event", label: "Event finish" },
  { id: "unassigned", label: "Unassigned" },
  { id: "blocked", label: "Blocked" },
];

type Props = Readonly<{
  value: CommandDeckFilter;
  onChange: (next: CommandDeckFilter) => void;
}>;

export function KitchenCommandDeckFilters({ value, onChange }: Props) {
  return (
    <fieldset className="kcd-filters">
      <legend>Prep filters</legend>
      {FILTERS.map((filter) => (
        <button
          key={filter.id}
          type="button"
          className="kcd-chip"
          aria-pressed={value === filter.id}
          onClick={() => onChange(filter.id)}
        >
          {filter.label}
        </button>
      ))}
    </fieldset>
  );
}
