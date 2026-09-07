import { useEffect, useMemo, useState } from "react";
import type { Id } from "../../lib/api";
import {
  useEventUpdateDaySheet,
  useGetEvent,
} from "../../lib/manifest-convex-react";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";

type Props = {
  readonly eventId: Id<"events">;
};

/**
 * Battle board day sheet — responsibility badges and buffet plate order,
 * printed on the board. Every value is free text with common suggestions;
 * an empty value means "not answered" and the board omits it. One save
 * writes the whole sheet (omitted values clear), so the form always sends
 * every field.
 */
const SHEET_FIELDS = [
  { key: "barService", label: "Bar service", group: "Scope" },
  { key: "cocktailHourFood", label: "Cocktail hour food", group: "Scope" },
  { key: "dessertService", label: "Dessert", group: "Scope" },
  { key: "bussing", label: "Bussing", group: "Scope" },
  { key: "placeSettings", label: "Place settings", group: "Scope" },
  { key: "passedApps", label: "Passed apps", group: "Service" },
  { key: "stationaryApps", label: "Stationary apps", group: "Service" },
  { key: "beveragesOnMenu", label: "Beverages on menu", group: "Service" },
  { key: "tablesideWater", label: "Tableside water", group: "Service" },
  { key: "mangiaDisposables", label: "Our disposables", group: "Logistics" },
  { key: "eventRentals", label: "Event rentals", group: "Logistics" },
  { key: "scullery", label: "Scullery", group: "Logistics" },
  { key: "powerOnsite", label: "Power onsite", group: "Logistics" },
  { key: "waterOnsite", label: "Water onsite", group: "Logistics" },
] as const;

type SheetKey =
  (typeof SHEET_FIELDS)[number]["key"] | "buffetColdPlates" | "buffetHotPlates";

const SHEET_SUGGESTIONS = [
  "Mangia",
  "Client",
  "Third party",
  "Full clear",
  "Prefill only",
  "Yes",
  "No",
  "Confirm on site",
];

const GROUPS = ["Scope", "Service", "Logistics"] as const;

type FormState = Record<SheetKey, string>;

export function EventDaySheetPanel({ eventId }: Props) {
  const event = useGetEvent(eventId);
  const save = useEventUpdateDaySheet();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);

  // Re-seed the form when the loaded event changes identity (navigation),
  // not on every reactive bump — local edits win while editing.
  const eventIdKey = String(event?._id ?? "");
  useEffect(() => {
    if (!event) return;
    setForm({
      barService: event.barService ?? "",
      cocktailHourFood: event.cocktailHourFood ?? "",
      dessertService: event.dessertService ?? "",
      bussing: event.bussing ?? "",
      placeSettings: event.placeSettings ?? "",
      passedApps: event.passedApps ?? "",
      stationaryApps: event.stationaryApps ?? "",
      beveragesOnMenu: event.beveragesOnMenu ?? "",
      tablesideWater: event.tablesideWater ?? "",
      mangiaDisposables: event.mangiaDisposables ?? "",
      eventRentals: event.eventRentals ?? "",
      scullery: event.scullery ?? "",
      powerOnsite: event.powerOnsite ?? "",
      waterOnsite: event.waterOnsite ?? "",
      buffetColdPlates: event.buffetColdPlates ?? "",
      buffetHotPlates: event.buffetHotPlates ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventIdKey]);

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        group,
        fields: SHEET_FIELDS.filter((field) => field.group === group),
      })),
    [],
  );

  const persist = async (next: FormState) => {
    if (!event) return;
    setBusy(true);
    setFailure(null);
    try {
      await save({
        docId: event._id,
        version: typeof event.version === "number" ? event.version : undefined,
        barService: next.barService,
        cocktailHourFood: next.cocktailHourFood,
        dessertService: next.dessertService,
        bussing: next.bussing,
        placeSettings: next.placeSettings,
        passedApps: next.passedApps,
        stationaryApps: next.stationaryApps,
        beveragesOnMenu: next.beveragesOnMenu,
        tablesideWater: next.tablesideWater,
        mangiaDisposables: next.mangiaDisposables,
        eventRentals: next.eventRentals,
        scullery: next.scullery,
        powerOnsite: next.powerOnsite,
        waterOnsite: next.waterOnsite,
        buffetColdPlates: next.buffetColdPlates,
        buffetHotPlates: next.buffetHotPlates,
      });
      setSavedAt(Date.now());
    } catch (cause) {
      setFailure(classifyCommandFailure(cause));
    } finally {
      setBusy(false);
    }
  };

  const setField = (key: SheetKey, value: string, commit: boolean) => {
    setForm((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      if (commit) void persist(next);
      return next;
    });
  };

  if (!form) {
    return (
      <section className="card p-5" aria-label="Battle board day sheet">
        <p className="text-sm text-ink-3">Loading the day sheet…</p>
      </section>
    );
  }

  return (
    <section
      className="card p-5"
      aria-label="Battle board day sheet"
      data-testid="event-day-sheet-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-ink">
            Battle board day sheet
          </h3>
          <p className="mt-1 text-sm text-ink-2">
            Responsibility badges and the buffet plate order, printed on the
            event's battle board. Empty answers are left off the board.
          </p>
        </div>
        <span className="text-sm text-ink-3" aria-live="polite">
          {busy ? "Saving…" : savedAt != null ? "Saved" : ""}
        </span>
      </div>

      {failure ? <FailureBanner failure={failure} /> : null}

      <div className="mt-4 grid gap-5 md:grid-cols-3">
        {grouped.map(({ group, fields }) => (
          <div key={group} className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-3">
              {group}
            </p>
            {fields.map((field) => (
              <label key={field.key} className="field-label block">
                <span>{field.label}</span>
                <select
                  className="input"
                  value={form[field.key]}
                  disabled={busy}
                  onChange={(changeEvent) =>
                    setField(field.key, changeEvent.target.value, true)
                  }
                >
                  <option value="">—</option>
                  {SHEET_SUGGESTIONS.map((suggestion) => (
                    <option key={suggestion} value={suggestion}>
                      {suggestion}
                    </option>
                  ))}
                  {form[field.key].trim().length > 0 &&
                  !SHEET_SUGGESTIONS.includes(form[field.key]) ? (
                    <option value={form[field.key]}>{form[field.key]}</option>
                  ) : null}
                </select>
              </label>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 border-t border-line pt-4 md:grid-cols-2">
        <label className="field-label block">
          <span>Buffet line — COLD plates (comma separated)</span>
          <input
            className="input"
            value={form.buffetColdPlates}
            disabled={busy}
            placeholder="Butter, Bread, Summer Salad"
            onChange={(changeEvent) =>
              setField("buffetColdPlates", changeEvent.target.value, false)
            }
            onBlur={(blurEvent) =>
              setField("buffetColdPlates", blurEvent.target.value, true)
            }
          />
        </label>
        <label className="field-label block">
          <span>Buffet line — HOT plates (comma separated)</span>
          <input
            className="input"
            value={form.buffetHotPlates}
            disabled={busy}
            placeholder="Asparagus, Mashed Potatoes, Strip"
            onChange={(changeEvent) =>
              setField("buffetHotPlates", changeEvent.target.value, false)
            }
            onBlur={(blurEvent) =>
              setField("buffetHotPlates", blurEvent.target.value, true)
            }
          />
        </label>
      </div>
    </section>
  );
}
