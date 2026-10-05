import { useState, type FormEvent } from "react";
import { useVenueSetSiteFacts } from "../../lib/manifest-convex-react";
import { SupplyFailureBanner } from "../inventory/SupplyFailureBanner";
import {
  loadWindowLabel,
  operatingFactsFromForm,
  type VenueOperatingFacts,
} from "./venueOperatingFacts";

type Props = {
  readonly venue: VenueOperatingFacts & {
    readonly _id: string;
    readonly status: string;
  };
};

const yesNoValue = (stored: boolean | null | undefined): string =>
  stored == null ? "" : stored ? "true" : "false";

const yesNoLabel = (stored: boolean | null | undefined): string =>
  stored == null ? "Not known" : stored ? "Yes" : "No";

const countLabel = (stored: number | null | undefined): string =>
  stored == null ? "Not known" : String(stored);

/** Seated / standing guests, oven, fridge and load-in window (spec §8.1).
 * These feed the venue filter, pack rules, the proposal and the day sheet. */
export function VenueOperatingFactsPanel({ venue }: Props) {
  const setFacts = useVenueSetSiteFacts();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const read = (name: string) => String(data.get(name) ?? "");
    const parsed = operatingFactsFromForm({
      seatedCapacity: read("seatedCapacity"),
      standingCapacity: read("standingCapacity"),
      hasOven: read("hasOven"),
      hasRefrigeration: read("hasRefrigeration"),
      loadInFrom: read("loadInFrom"),
      loadOutBy: read("loadOutBy"),
    });
    if (!parsed.ok) {
      setFailure(new Error(parsed.error));
      return;
    }
    setFailure(null);
    setBusy(true);
    void setFacts({ docId: venue._id, ...parsed.value })
      .then(() => setEditing(false))
      .catch((error: unknown) => setFailure(error))
      .finally(() => setBusy(false));
  };

  const loadWindow = loadWindowLabel(venue);

  return (
    <section
      className="rounded-sm bg-panel p-6 shadow-sm"
      data-testid="venue-operating-facts"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Guests, kitchen and load-in</h3>
        {!editing && venue.status === "active" && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        )}
      </div>
      {failure != null && <SupplyFailureBanner error={failure} />}
      {editing ? (
        <form onSubmit={save} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-ink-2">
              Seated guests
              <input
                type="number"
                name="seatedCapacity"
                min="0"
                step="1"
                defaultValue={venue.seatedCapacity ?? ""}
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
              />
            </label>
            <label className="block text-xs font-medium text-ink-2">
              Standing guests
              <input
                type="number"
                name="standingCapacity"
                min="0"
                step="1"
                defaultValue={venue.standingCapacity ?? ""}
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
              />
            </label>
            <label className="block text-xs font-medium text-ink-2">
              Oven on site
              <select
                name="hasOven"
                defaultValue={yesNoValue(venue.hasOven)}
                className="mt-1 block w-full rounded-sm border-line-2"
              >
                <option value="">Not known</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-ink-2">
              Fridge or walk-in on site
              <select
                name="hasRefrigeration"
                defaultValue={yesNoValue(venue.hasRefrigeration)}
                className="mt-1 block w-full rounded-sm border-line-2"
              >
                <option value="">Not known</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-ink-2">
              Load in from
              <input
                type="time"
                name="loadInFrom"
                defaultValue={venue.loadInFrom ?? ""}
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
              />
            </label>
            <label className="block text-xs font-medium text-ink-2">
              Out by
              <input
                type="time"
                name="loadOutBy"
                defaultValue={venue.loadOutBy ?? ""}
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-ink-3">Seated guests</dt>
            <dd className="text-ink">{countLabel(venue.seatedCapacity)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Standing guests</dt>
            <dd className="text-ink">{countLabel(venue.standingCapacity)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Oven on site</dt>
            <dd className="text-ink">{yesNoLabel(venue.hasOven)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Fridge or walk-in</dt>
            <dd className="text-ink">{yesNoLabel(venue.hasRefrigeration)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-ink-3">Load-in window</dt>
            <dd className="text-ink">{loadWindow ?? "Not known"}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
