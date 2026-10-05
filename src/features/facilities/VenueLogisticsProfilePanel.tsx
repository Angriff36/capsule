import { useState, type FormEvent } from "react";
import { useVenueSetLogisticsProfile } from "../../lib/manifest-convex-react";
import { SupplyFailureBanner } from "../inventory/SupplyFailureBanner";
import {
  VENUE_LOGISTICS_FIELDS,
  logisticsArgsFromForm,
  type VenueLogisticsProfile,
} from "./venueLogistics";

type Props = {
  readonly venue: VenueLogisticsProfile & {
    readonly _id: string;
    readonly status: string;
  };
};

const shown = (value: string | null | undefined) =>
  value?.trim() || "Not known";

/** The logistics profile from a site survey: dock, elevator, kitchen
 * equipment, power, parking, arrival rules and the day-of access contact.
 * Every event at this venue and its BEO show it. */
export function VenueLogisticsProfilePanel({ venue }: Props) {
  const setProfile = useVenueSetLogisticsProfile();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const args = logisticsArgsFromForm((name) => String(data.get(name) ?? ""));
    setFailure(null);
    setBusy(true);
    void setProfile({ docId: venue._id, ...args })
      .then(() => setEditing(false))
      .catch((error: unknown) => setFailure(error))
      .finally(() => setBusy(false));
  };

  const contact =
    [venue.dayOfContactName, venue.dayOfContactPhone]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" · ") || "Not known";

  return (
    <section
      className="rounded-sm bg-panel p-6 shadow-sm"
      data-testid="venue-logistics-profile"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Logistics profile</h3>
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
      <p className="mt-1 text-xs text-ink-3">
        Shown on every event at this venue and on its BEO.
      </p>
      {failure != null && <SupplyFailureBanner error={failure} />}
      {editing ? (
        <form onSubmit={save} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-ink-2">
              Day-of access contact
              <input
                name="dayOfContactName"
                defaultValue={venue.dayOfContactName ?? ""}
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
              />
            </label>
            <label className="block text-xs font-medium text-ink-2">
              Day-of contact phone
              <input
                type="tel"
                name="dayOfContactPhone"
                defaultValue={venue.dayOfContactPhone ?? ""}
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
              />
            </label>
            {VENUE_LOGISTICS_FIELDS.map((field) => (
              <label
                key={field.name}
                className="block text-xs font-medium text-ink-2"
              >
                {field.label}
                <textarea
                  name={field.name}
                  rows={2}
                  placeholder={field.hint}
                  defaultValue={venue[field.name] ?? ""}
                  className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
                />
              </label>
            ))}
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
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-ink-3">Day-of access contact</dt>
            <dd className="text-ink">{contact}</dd>
          </div>
          {VENUE_LOGISTICS_FIELDS.map((field) => (
            <div key={field.name}>
              <dt className="text-ink-3">{field.label}</dt>
              <dd className="whitespace-pre-line text-ink">
                {shown(venue[field.name])}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
