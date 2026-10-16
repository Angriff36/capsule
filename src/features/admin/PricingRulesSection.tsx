import { useState, type FormEvent } from "react";
import type { Doc } from "../../lib/api";
import {
  useCreateOrganization,
  useOrganizationConfigurePricingRules,
} from "../../lib/manifest-convex-react";
import {
  readPricingRules,
  WEEKDAYS,
  type HolidayMinimum,
  type PricingRules,
  type SeasonRange,
} from "../../lib/pricingRules";
import { Section } from "../../ui/primitives";

const seasonsText = (seasons: SeasonRange[]) =>
  seasons.map((range) => `${range.from} to ${range.to}`).join("\n");

/** "05-01 to 10-31" per line → ranges; a line that is not two dates is an error. */
function parseSeasonsText(value: string): SeasonRange[] | string {
  const ranges: SeasonRange[] = [];
  for (const raw of value.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const match =
      /^(\d{1,2})-(\d{1,2})\s*(?:to|-|–)\s*(\d{1,2})-(\d{1,2})$/.exec(line);
    const pad = (part: string) => part.padStart(2, "0");
    const valid = (month: number, day: number) =>
      month >= 1 && month <= 12 && day >= 1 && day <= 31;
    if (
      !match ||
      !valid(Number(match[1]), Number(match[2])) ||
      !valid(Number(match[3]), Number(match[4]))
    ) {
      return `"${line}" is not a season. Write month-day to month-day, like 05-01 to 10-31.`;
    }
    ranges.push({
      from: `${pad(match[1])}-${pad(match[2])}`,
      to: `${pad(match[3])}-${pad(match[4])}`,
    });
  }
  return ranges;
}

const holidaysText = (holidays: HolidayMinimum[]) =>
  holidays
    .map(
      (row) => `${row.date}, ${row.label ? `${row.label}, ` : ""}${row.amount}`,
    )
    .join("\n");

/**
 * "12-24, Christmas Eve, 5000" or "2026-11-26, Thanksgiving, 5000" per line;
 * the name is optional. A line without a date and an amount is an error.
 */
function parseHolidaysText(value: string): HolidayMinimum[] | string {
  const rows: HolidayMinimum[] = [];
  for (const raw of value.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const match =
      /^((?:\d{4}-)?\d{1,2}-\d{1,2})\s*,\s*(?:(.*?)\s*,\s*)?\$?(\d+(?:\.\d+)?)$/.exec(
        line,
      );
    if (!match || !(Number(match[3]) > 0))
      return `"${line}" is not a holiday minimum. Write the date, a name and the amount, like 12-24, Christmas Eve, 5000.`;
    const parts = match[1].split("-");
    const pad = (part: string) => part.padStart(2, "0");
    const date =
      parts.length === 3
        ? `${parts[0]}-${pad(parts[1])}-${pad(parts[2])}`
        : `${pad(parts[0])}-${pad(parts[1])}`;
    rows.push({ date, label: match[2] ?? "", amount: Number(match[3]) });
  }
  return rows;
}

/**
 * Company price rules: catering minimums by weekday, season and holiday, the
 * minimum for far events, the retainer a payment schedule starts from, the
 * tasting fee, and whether menus show the extra price fields. Each company
 * sets its own; empty rules change nothing.
 */
export function PricingRulesSection({
  record,
  canEdit,
  busy,
  run,
}: {
  record: Doc<"organizations"> | null;
  canEdit: boolean;
  busy: boolean;
  run: (work: () => Promise<unknown>, done: string) => Promise<boolean>;
}) {
  const rules = readPricingRules(record);
  const createOrganization = useCreateOrganization();
  const configure = useOrganizationConfigurePricingRules();
  const [error, setError] = useState<string | null>(null);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = (key: string) => Math.max(0, Number(data.get(key)) || 0);
    const seasons = parseSeasonsText(String(data.get("peakSeasons") ?? ""));
    if (typeof seasons === "string") {
      setError(seasons);
      return;
    }
    const holidays = parseHolidaysText(String(data.get("holidays") ?? ""));
    if (typeof holidays === "string") {
      setError(holidays);
      return;
    }
    setError(null);
    const next: PricingRules = {
      menuPriceOptions: data.get("menuPriceOptions") === "on",
      peakSeasons: seasons,
      peakMinimums: WEEKDAYS.map((_, day) => amount(`peak${day}`)),
      offPeakMinimums: WEEKDAYS.map((_, day) => amount(`off${day}`)),
      farAwayMinimum: amount("farAwayMinimum"),
      farAwayMiles: amount("farAwayMiles"),
      farAwayHours: amount("farAwayHours"),
      holidays,
      retainer: amount("retainer"),
      tasting: {
        perGuest: amount("tastingPerGuest"),
        maxGuests: Math.round(amount("tastingMaxGuests")),
        freeAt: amount("tastingFreeAt"),
      },
    };
    await run(async () => {
      let docId = record?._id;
      let version = record?.version;
      if (!docId) {
        const created = (await createOrganization({ name: "My company" })) as {
          docId: Doc<"organizations">["_id"];
        };
        docId = created.docId;
        version = undefined;
      }
      await configure({ docId, version, rulesJson: JSON.stringify(next) });
    }, "Price rules saved. Proposals and menus use them now.");
  };

  return (
    <Section title="Price rules">
      <p className="text-base text-ink-2">
        Your own price rules. Leave a minimum at 0 when you do not use one.
        Proposals under the minimum show the gap and can add it as a line.
      </p>
      <form
        key={`${record?._id ?? "new"}:${record?.version ?? 0}`}
        className="supply-form mt-3 border-0 shadow-none"
        onSubmit={(e) => void save(e)}
      >
        <fieldset disabled={!canEdit || busy} className="grid gap-3">
          <label className="flex items-center gap-2">
            <input
              name="menuPriceOptions"
              type="checkbox"
              defaultChecked={rules.menuPriceOptions}
            />
            Menus show extra fields: client picks per course, price range, price
            choices, add-ons, smallest spend and price by count
          </label>
          <label>
            Busy season
            <textarea
              name="peakSeasons"
              rows={2}
              defaultValue={seasonsText(rules.peakSeasons)}
            />
            <span className="mt-1 block text-xs font-normal text-ink-3">
              One range per line, month-day to month-day, like 05-01 to 10-31.
              Every other day is off season.
            </span>
          </label>
          <div className="overflow-x-auto">
            <table className="data-table">
              <caption className="eyebrow text-left">
                Catering minimum, food and drink ($)
              </caption>
              <thead>
                <tr>
                  <th scope="col">Season</th>
                  {WEEKDAYS.map((day) => (
                    <th key={day} scope="col">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["peak", "Busy", rules.peakMinimums],
                    ["off", "Off", rules.offPeakMinimums],
                  ] as const
                ).map(([key, label, values]) => (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    {WEEKDAYS.map((day, index) => (
                      <td key={day}>
                        <input
                          name={`${key}${index}`}
                          type="number"
                          min={0}
                          step="0.01"
                          className="input w-24"
                          aria-label={`${label} season ${day} minimum`}
                          defaultValue={values[index] || ""}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Far-away minimum ($)
              <input
                name="farAwayMinimum"
                type="number"
                min={0}
                step="0.01"
                defaultValue={rules.farAwayMinimum || ""}
              />
              <span className="mt-1 block text-xs font-normal text-ink-3">
                Any day, when it is higher than the weekday minimum.
              </span>
            </label>
            <label>
              Far away starts at (miles, one way)
              <input
                name="farAwayMiles"
                type="number"
                min={0}
                step="1"
                defaultValue={rules.farAwayMiles || ""}
              />
              <span className="mt-1 block text-xs font-normal text-ink-3">
                Each proposal can also mark its event as far away.
              </span>
            </label>
            <label>
              Or far away from (hours of driving, one way)
              <input
                name="farAwayHours"
                type="number"
                min={0}
                step="0.25"
                defaultValue={rules.farAwayHours || ""}
              />
              <span className="mt-1 block text-xs font-normal text-ink-3">
                Uses the event&apos;s drive time when Capsule has one.
              </span>
            </label>
            <label>
              Retainer ($)
              <input
                name="retainer"
                type="number"
                min={0}
                step="0.01"
                defaultValue={rules.retainer || ""}
              />
              <span className="mt-1 block text-xs font-normal text-ink-3">
                A new payment schedule starts with this fixed deposit.
              </span>
            </label>
          </div>
          <label>
            Holiday minimums
            <textarea
              name="holidays"
              rows={3}
              defaultValue={holidaysText(rules.holidays)}
            />
            <span className="mt-1 block text-xs font-normal text-ink-3">
              One per line: the date (month-day every year, or year-month-day
              once), a name, and the minimum, like 12-24, Christmas Eve, 5000.
              The highest minimum that fits an event is the one it gets.
            </span>
          </label>
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="eyebrow">Tasting fee</legend>
            <label>
              Per tasting guest ($)
              <input
                name="tastingPerGuest"
                type="number"
                min={0}
                step="0.01"
                defaultValue={rules.tasting.perGuest || ""}
              />
            </label>
            <label>
              Up to (guests)
              <input
                name="tastingMaxGuests"
                type="number"
                min={0}
                step="1"
                defaultValue={rules.tasting.maxGuests || ""}
              />
            </label>
            <label>
              Free from food and drink of ($)
              <input
                name="tastingFreeAt"
                type="number"
                min={0}
                step="0.01"
                defaultValue={rules.tasting.freeAt || ""}
              />
            </label>
          </fieldset>
        </fieldset>
        {error ? (
          <p role="alert" className="mt-2 text-base text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="btn btn-primary mt-3"
          disabled={!canEdit || busy}
        >
          Save price rules
        </button>
      </form>
    </Section>
  );
}
