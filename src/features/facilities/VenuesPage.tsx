import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateVenue,
  useVenueDeactivate,
  useVenueActivate,
  useListVenue,
} from "../../lib/manifest-convex-react";
import { venueDetailPath } from "./facilitiesRoutes";
import { PageHeader, StatusChip, TableSkeleton } from "../../ui/primitives";
import { useActionPrompt } from "../../ui/action-prompt";
import { FacilitiesWorkspaceNav } from "./FacilitiesWorkspaceNav";
import { SupplyFailureBanner } from "../inventory/SupplyFailureBanner";

const VENUE_TYPES = [
  "client_site",
  "banquet_hall",
  "outdoor",
  "office",
  "private_home",
  "other",
] as const;

type VenueType = (typeof VENUE_TYPES)[number];

const VENUE_TYPE_LABELS: Record<VenueType, string> = {
  client_site: "Client Site",
  banquet_hall: "Banquet Hall",
  outdoor: "Outdoor",
  office: "Office",
  private_home: "Private Home",
  other: "Other",
};

const LOGISTICS_BOOLEANS = [
  { name: "parkingAvailable", label: "Parking Available" },
  { name: "hasFreightElevator", label: "Freight Elevator" },
  { name: "storageAvailable", label: "Storage Available" },
  { name: "powerAvailable", label: "Power Available" },
  { name: "waterAccess", label: "Water Access" },
  { name: "hasStairs", label: "Stairs (load-in)" },
] as const;

// Tri-state logistics booleans: "" = Unknown (unset), "true" = Yes, "false" = No.
// A binary checkbox cannot express "unknown" vs "confirmed no", which mismarks
// venues created before a field existed. A select gives the operator all three.
const triStateBoolean = (
  value: FormDataEntryValue | null,
): boolean | undefined =>
  value === "true" ? true : value === "false" ? false : undefined;

export function VenuesPage() {
  const venues = useListVenue();
  const createVenue = useCreateVenue();
  const deactivate = useVenueDeactivate();
  const activate = useVenueActivate();

  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt();

  const rows = (venues ?? []).filter((item) => item.deletedAt == null);
  const activeRows = rows.filter(
    (item) => item.status === "active" || item.status === "inactive",
  );

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);
    void run("register", async () => {
      await createVenue({
        name: String(data.get("name") ?? "").trim(),
        venueType: String(data.get("venueType")) as VenueType,
        capacity: Number(data.get("capacity")),
        onPremise: data.get("onPremise") === "on",
        kitchenAccess:
          String(data.get("kitchenAccess") ?? "").trim() || undefined,
        parkingAvailable: triStateBoolean(data.get("parkingAvailable")),
        hasFreightElevator: triStateBoolean(data.get("hasFreightElevator")),
        storageAvailable: triStateBoolean(data.get("storageAvailable")),
        logisticsNotes:
          String(data.get("logisticsNotes") ?? "").trim() || undefined,
        loadInInstructions:
          String(data.get("loadInInstructions") ?? "").trim() || undefined,
        powerAvailable: triStateBoolean(data.get("powerAvailable")),
        waterAccess: triStateBoolean(data.get("waterAccess")),
        hasStairs: triStateBoolean(data.get("hasStairs")),
        wasteRules: String(data.get("wasteRules") ?? "").trim() || undefined,
        permitsInsuranceNotes:
          String(data.get("permitsInsuranceNotes") ?? "").trim() || undefined,
        restrictions:
          String(data.get("restrictions") ?? "").trim() || undefined,
        addressLine1: String(data.get("addressLine1") ?? "").trim(),
        city: String(data.get("city") ?? "").trim(),
        region: String(data.get("region") ?? "").trim(),
        postalCode: String(data.get("postalCode") ?? "").trim(),
        country: String(data.get("country") ?? "").trim() || undefined,
        accessNotes: String(data.get("accessNotes") ?? "").trim() || undefined,
        cateringNotes:
          String(data.get("cateringNotes") ?? "").trim() || undefined,
        contactName: String(data.get("contactName") ?? "").trim() || undefined,
        contactEmail:
          String(data.get("contactEmail") ?? "").trim() || undefined,
        contactPhone:
          String(data.get("contactPhone") ?? "").trim() || undefined,
      });
      element.reset();
      setShowForm(false);
    });
  };

  const handleToggleStatus = (venue: (typeof rows)[number]) => {
    const id = venue._id;
    const key = `${id}:toggle`;
    void run(key, async () => {
      if (venue.status === "active") {
        const reason = await prompt.askReason({
          title: "Deactivate venue",
          description: `Take ${venue.name} out of active use.`,
          label: "Reason for deactivation",
          confirmLabel: "Deactivate venue",
          tone: "danger",
        });
        if (!reason) return;
        await deactivate({ docId: id, version: venue.version, reason });
      } else {
        await activate({ docId: id, version: venue.version });
      }
    });
  };

  if (venues === undefined) return <TableSkeleton rows={8} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Venues"
        lead={`${activeRows.length} venue${activeRows.length !== 1 ? "s" : ""}`}
        actions={
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Cancel" : "Add venue"}
          </button>
        }
      />
      <FacilitiesWorkspaceNav />
      {host}

      {failure != null && <SupplyFailureBanner error={failure} />}

      {showForm && (
        <form onSubmit={submit} className="space-y-4 rounded-sm bg-inset p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-ink-2">
                Name *
              </label>
              <input
                type="text"
                name="name"
                required
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
                placeholder="Grand Ballroom"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2">
                Type *
              </label>
              <select
                name="venueType"
                required
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
              >
                {VENUE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {VENUE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2">
                On-Premise Venue
              </label>
              <div className="mt-2 flex items-center">
                <input
                  type="checkbox"
                  name="onPremise"
                  className="h-4 w-4 rounded-xs border-line-2"
                />
                <span className="ml-2 text-xs text-ink-2">
                  Check if this is an on-premise venue
                </span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-ink-2">
                Logistics Information
              </label>
              <div className="mt-2 space-y-2">
                <div>
                  <label className="block text-2xs text-ink-2">
                    Kitchen Access
                  </label>
                  <input
                    type="text"
                    name="kitchenAccess"
                    className="mt-1 block w-full rounded-sm border-line-2 shadow-sm text-xs"
                    placeholder="e.g., Full kitchen, warming station only, no kitchen"
                  />
                </div>
                <div>
                  <label className="block text-2xs text-ink-2">
                    Load-in Instructions
                  </label>
                  <input
                    type="text"
                    name="loadInInstructions"
                    className="mt-1 block w-full rounded-sm border-line-2 shadow-sm text-xs"
                    placeholder="e.g., Dock door 3, load-in 6:00–8:00am, freight entrance off Maple"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {LOGISTICS_BOOLEANS.map((field) => (
                    <div key={field.name}>
                      <label className="block text-2xs text-ink-2">
                        {field.label}
                      </label>
                      <select
                        name={field.name}
                        defaultValue=""
                        className="mt-1 block w-full rounded-sm border-line-2 text-xs"
                      >
                        <option value="">Unknown</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2">
                Capacity *
              </label>
              <input
                type="number"
                name="capacity"
                required
                min="1"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
                placeholder="150"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2">
                Address Line 1
              </label>
              <input
                type="text"
                name="addressLine1"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
                placeholder="123 Main St"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2">
                City
              </label>
              <input
                type="text"
                name="city"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
                placeholder="Springfield"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2">
                State/Region
              </label>
              <input
                type="text"
                name="region"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
                placeholder="IL"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2">
                Postal Code
              </label>
              <input
                type="text"
                name="postalCode"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
                placeholder="62701"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2">
                Contact Name
              </label>
              <input
                type="text"
                name="contactName"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
                placeholder="John Smith"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2">
                Contact Email
              </label>
              <input
                type="email"
                name="contactEmail"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
                placeholder="john@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2">
                Contact Phone
              </label>
              <input
                type="tel"
                name="contactPhone"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2">
              Access Notes
            </label>
            <textarea
              name="accessNotes"
              rows={2}
              className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
              placeholder="Loading dock available, stairs to second floor..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2">
              Catering Notes
            </label>
            <textarea
              name="cateringNotes"
              rows={2}
              className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
              placeholder="Kitchen available, equipment restrictions..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2">
              Logistics Notes (other)
            </label>
            <textarea
              name="logisticsNotes"
              rows={2}
              className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
              placeholder="Any other logistics context not captured above..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2">
              Waste Rules
            </label>
            <textarea
              name="wasteRules"
              rows={2}
              className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
              placeholder="e.g., Dumpster behind dock, no grease disposal on-site, recycling required"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2">
              Permits / Insurance
            </label>
            <textarea
              name="permitsInsuranceNotes"
              rows={2}
              className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
              placeholder="e.g., COI required naming venue, sound permit needed, open-flame permit"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2">
              Restrictions
            </label>
            <textarea
              name="restrictions"
              rows={2}
              className="mt-1 block w-full rounded-sm border-line-2 shadow-sm"
              placeholder="e.g., No open flame, sound curfew 10pm, no tape on walls"
            />
          </div>
          <div className="flex justify-end">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy === "register"}
            >
              {busy === "register" ? "Creating..." : "Create Venue"}
            </button>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <div className="rounded-sm bg-inset p-8 text-center text-ink-3">
          No venues yet. Click "Add venue" to create one.
        </div>
      ) : (
        <div className="overflow-hidden rounded-sm border border-line">
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-inset">
              <tr>
                <th className="px-4 py-3 text-left text-2xs font-medium uppercase text-ink-3">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-2xs font-medium uppercase text-ink-3">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-2xs font-medium uppercase text-ink-3">
                  Capacity
                </th>
                <th className="px-4 py-3 text-left text-2xs font-medium uppercase text-ink-3">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-2xs font-medium uppercase text-ink-3">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-2xs font-medium uppercase text-ink-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-panel">
              {rows.map((venue) => (
                <tr key={venue._id} className="hover:bg-inset">
                  <td className="px-4 py-3">
                    <Link
                      to={venueDetailPath(venue._id)}
                      className="font-medium text-brand hover:underline"
                    >
                      {venue.name}
                    </Link>
                    {venue.contactName && (
                      <div className="text-2xs text-ink-3">
                        {venue.contactName}
                        {venue.contactPhone && ` • ${venue.contactPhone}`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-2">
                    {VENUE_TYPE_LABELS[venue.venueType as VenueType] ||
                      venue.venueType}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-2">
                    {venue.capacity ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-2">
                    {[venue.city, venue.region].filter(Boolean).join(", ") ||
                      "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip
                      status={venue.status === "active" ? "active" : "inactive"}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="btn btn-ghost text-xs"
                      type="button"
                      onClick={() => handleToggleStatus(venue)}
                      disabled={busy === `${venue._id}:toggle`}
                    >
                      {busy === `${venue._id}:toggle`
                        ? "..."
                        : venue.status === "active"
                          ? "Deactivate"
                          : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
