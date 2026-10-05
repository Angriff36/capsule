import {
  useListOccasion,
  useListPerson,
  useListReferralSource,
  useListServiceStyle,
  useListVenue,
} from "../../lib/manifest-convex-react";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";
import { EVENT_STAGES, STAGE_LABEL } from "../events/eventStatus";
import {
  REPORT_FILTER_LABELS,
  type ReportEventFilterKey,
  type ReportFilters,
} from "./reportFilters";

interface Option {
  value: string;
  label: string;
}

/**
 * The eight report filters (CF-7.2-01). Lists come from the company's own
 * catalogs; a list the reader cannot see stays empty, so its filter only
 * offers "Any".
 */
export function ReportFilterBar({
  filters,
  disabled,
  onChange,
}: {
  filters: ReportFilters;
  disabled: boolean;
  onChange: (filters: ReportFilters) => void;
}) {
  const people = useListPerson();
  const occasions = useListOccasion();
  const serviceStyles = useListServiceStyle();
  const venues = useListVenue();
  const referrals = useListReferralSource();

  const set = (key: keyof ReportFilters, value: string) => {
    const next = { ...filters };
    if (value) (next as Record<string, string>)[key] = value;
    else delete next[key];
    onChange(next);
  };

  const options: Record<ReportEventFilterKey, Option[]> = {
    stage: EVENT_STAGES.map((stage) => ({
      value: stage,
      label: STAGE_LABEL[stage],
    })),
    salespersonId: named(people, (person) =>
      `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim(),
    ),
    occasionId: named(occasions, (row) => String(row.name ?? "")),
    serviceStyleId: named(serviceStyles, (row) => String(row.name ?? "")),
    venueId: named(venues, (row) => String(row.name ?? "")),
    premise: [
      { value: "on", label: "On premise" },
      { value: "off", label: "Off premise" },
    ],
    referralSourceId: named(referrals, (row) => String(row.name ?? "")),
  };

  return (
    <fieldset
      className="live-report-controls"
      aria-label="Report filters"
      data-testid="report-filter-bar"
      disabled={disabled}
    >
      <label>
        <span>{REPORT_FILTER_LABELS.from}</span>
        <BoundedDateInput
          className="input"
          value={filters.from ?? ""}
          onChange={(event) => set("from", event.target.value)}
        />
      </label>
      <label>
        <span>{REPORT_FILTER_LABELS.to}</span>
        <BoundedDateInput
          className="input"
          value={filters.to ?? ""}
          onChange={(event) => set("to", event.target.value)}
        />
      </label>
      {(Object.keys(options) as ReportEventFilterKey[]).map((key) => (
        <label key={key}>
          <span>{REPORT_FILTER_LABELS[key]}</span>
          <select
            className="input"
            value={filters[key] ?? ""}
            onChange={(event) => set(key, event.target.value)}
          >
            <option value="">Any</option>
            {options[key].map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </fieldset>
  );
}

function named<T extends { _id: unknown; deletedAt?: unknown }>(
  rows: readonly T[] | undefined,
  label: (row: T) => string,
): Option[] {
  return (rows ?? [])
    .filter((row) => row.deletedAt == null)
    .map((row) => ({ value: String(row._id), label: label(row) }))
    .filter((option) => option.label)
    .sort((left, right) => left.label.localeCompare(right.label));
}
