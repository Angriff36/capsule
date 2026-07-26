import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useGetVenue,
  useVenueUpdateDetails,
  useVenueChangeCapacity,
  useVenueDeactivate,
  useVenueActivate,
} from "../../lib/manifest-convex-react";
import {
  venueLayoutTemplatesListPath,
  venueListPath,
  venueVendorRelationshipsListPath,
} from "./facilitiesRoutes";
import { StatusChip } from "../../ui/primitives";
import { SupplyFailureBanner } from "../inventory/SupplyFailureBanner";
import { VenueNotesPanel } from "./VenueNotesPanel";

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

export function VenueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const venue = useGetVenue(id ?? "skip");

  const updateDetails = useVenueUpdateDetails();
  const changeCapacity = useVenueChangeCapacity();
  const deactivate = useVenueDeactivate();
  const activate = useVenueActivate();

  const [showEditForm, setShowEditForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  if (id === "skip" || venue === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center text-gray-500">Loading...</div>
      </div>
    );
  }

  if (venue === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center text-gray-500">
          <p>Venue not found</p>
          <Link
            to={venueListPath()}
            className="text-blue-600 hover:text-blue-800"
          >
            Back to Venues
          </Link>
        </div>
      </div>
    );
  }

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

  const handleUpdateDetails = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);
    void run("updateDetails", async () => {
      await updateDetails({
        docId: venue._id,
        version: venue.version,
        name: String(data.get("name") ?? "").trim(),
        venueType: String(data.get("venueType")) as VenueType,
        onPremise: data.get("onPremise") === "on",
        kitchenAccess:
          String(data.get("kitchenAccess") ?? "").trim() || undefined,
        parkingAvailable: data.get("parkingAvailable") === "on",
        hasFreightElevator: data.get("hasFreightElevator") === "on",
        storageAvailable: data.get("storageAvailable") === "on",
        logisticsNotes:
          String(data.get("logisticsNotes") ?? "").trim() || undefined,
        loadInInstructions:
          String(data.get("loadInInstructions") ?? "").trim() || undefined,
        powerAvailable: data.get("powerAvailable") === "on",
        waterAccess: data.get("waterAccess") === "on",
        hasStairs: data.get("hasStairs") === "on",
        wasteRules: String(data.get("wasteRules") ?? "").trim() || undefined,
        permitsInsuranceNotes:
          String(data.get("permitsInsuranceNotes") ?? "").trim() || undefined,
        restrictions:
          String(data.get("restrictions") ?? "").trim() || undefined,
        addressLine1:
          String(data.get("addressLine1") ?? "").trim() || undefined,
        addressLine2:
          String(data.get("addressLine2") ?? "").trim() || undefined,
        city: String(data.get("city") ?? "").trim() || undefined,
        region: String(data.get("region") ?? "").trim() || undefined,
        postalCode: String(data.get("postalCode") ?? "").trim() || undefined,
        countryCode: String(data.get("country") ?? "").trim() || undefined,
        accessNotes: String(data.get("accessNotes") ?? "").trim() || undefined,
        cateringNotes:
          String(data.get("cateringNotes") ?? "").trim() || undefined,
        contactName: String(data.get("contactName") ?? "").trim() || undefined,
        contactEmail:
          String(data.get("contactEmail") ?? "").trim() || undefined,
        contactPhone:
          String(data.get("contactPhone") ?? "").trim() || undefined,
      });
      setShowEditForm(false);
    });
  };

  const handleChangeCapacity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);
    void run("changeCapacity", async () => {
      await changeCapacity({
        docId: venue._id,
        version: venue.version,
        capacity: Number(data.get("capacity")),
      });
      (event.target as HTMLFormElement).reset();
    });
  };

  const handleDeactivate = () => {
    const reason = window.prompt("Reason for deactivation:");
    if (!reason) return;
    void run("deactivate", async () => {
      await deactivate({
        docId: venue._id,
        version: venue.version,
        reason,
      });
      setShowEditForm(false);
    });
  };

  const handleActivate = () => {
    void run("activate", async () => {
      await activate({
        docId: venue._id,
        version: venue.version,
      });
      setShowEditForm(false);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            to={venueListPath()}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← Back to Venues
          </Link>
        </div>
        <StatusChip
          status={venue.status === "active" ? "active" : "inactive"}
        />
      </div>

      {failure != null && <SupplyFailureBanner error={failure} />}

      {/* Venue Header */}
      <div className="rounded-md bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{venue.name}</h1>
            <p className="text-sm text-gray-500">
              {VENUE_TYPE_LABELS[venue.venueType as VenueType] ||
                venue.venueType}
              {venue.capacity && ` • Capacity: ${venue.capacity}`}
            </p>
          </div>
          {!showEditForm && (
            <div className="flex gap-2">
              {venue.status === "inactive" && (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={handleActivate}
                  disabled={busy === "activate"}
                >
                  {busy === "activate" ? "Activating..." : "Activate Venue"}
                </button>
              )}
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setShowEditForm(true)}
                disabled={venue.status === "inactive"}
              >
                Edit Details
              </button>
              <Link
                to={venueVendorRelationshipsListPath(venue._id)}
                className="btn btn-secondary"
              >
                Vendor Relationships
              </Link>
              <Link
                to={venueLayoutTemplatesListPath(venue._id)}
                className="btn btn-secondary"
              >
                Layout Templates
              </Link>
            </div>
          )}
        </div>
      </div>

      {showEditForm && (
        <form
          onSubmit={handleUpdateDetails}
          className="space-y-4 rounded-md bg-gray-50 p-4"
        >
          <h3 className="text-lg font-medium">Edit Venue Details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Name *
              </label>
              <input
                type="text"
                name="name"
                required
                defaultValue={venue.name}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Type *
              </label>
              <select
                name="venueType"
                required
                defaultValue={venue.venueType}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              >
                {VENUE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {VENUE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                On-Premise Venue
              </label>
              <div className="mt-2 flex items-center">
                <input
                  type="checkbox"
                  name="onPremise"
                  defaultChecked={venue.onPremise ?? false}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-600">
                  Check if this is an on-premise venue (catering at venue)
                </span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Logistics Information
              </label>
              <div className="mt-2 space-y-2">
                <div>
                  <label className="block text-xs text-gray-600">
                    Kitchen Access
                  </label>
                  <input
                    type="text"
                    name="kitchenAccess"
                    defaultValue={venue.kitchenAccess ?? ""}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                    placeholder="e.g., Full kitchen, warming station only, no kitchen"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600">
                    Load-in Instructions
                  </label>
                  <input
                    type="text"
                    name="loadInInstructions"
                    defaultValue={venue.loadInInstructions ?? ""}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                    placeholder="e.g., Dock door 3, load-in 6:00–8:00am, freight entrance off Maple"
                  />
                </div>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      name="parkingAvailable"
                      defaultChecked={venue.parkingAvailable ?? false}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="ml-2 text-xs text-gray-600">
                      Parking Available
                    </span>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      name="hasFreightElevator"
                      defaultChecked={venue.hasFreightElevator ?? false}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="ml-2 text-xs text-gray-600">
                      Freight Elevator
                    </span>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      name="storageAvailable"
                      defaultChecked={venue.storageAvailable ?? false}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="ml-2 text-xs text-gray-600">
                      Storage Available
                    </span>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      name="powerAvailable"
                      defaultChecked={venue.powerAvailable ?? false}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="ml-2 text-xs text-gray-600">
                      Power Available
                    </span>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      name="waterAccess"
                      defaultChecked={venue.waterAccess ?? false}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="ml-2 text-xs text-gray-600">
                      Water Access
                    </span>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      name="hasStairs"
                      defaultChecked={venue.hasStairs ?? false}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="ml-2 text-xs text-gray-600">
                      Stairs (load-in)
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Address Line 1
              </label>
              <input
                type="text"
                name="addressLine1"
                defaultValue={venue.addressLine1 ?? ""}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Address Line 2
              </label>
              <input
                type="text"
                name="addressLine2"
                defaultValue={venue.addressLine2 ?? ""}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                City
              </label>
              <input
                type="text"
                name="city"
                defaultValue={venue.city ?? ""}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                State/Region
              </label>
              <input
                type="text"
                name="region"
                defaultValue={venue.region ?? ""}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Postal Code
              </label>
              <input
                type="text"
                name="postalCode"
                defaultValue={venue.postalCode ?? ""}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Country
              </label>
              <input
                type="text"
                name="country"
                defaultValue={venue.countryCode ?? ""}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Contact Name
              </label>
              <input
                type="text"
                name="contactName"
                defaultValue={venue.contactName ?? ""}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Contact Email
              </label>
              <input
                type="email"
                name="contactEmail"
                defaultValue={venue.contactEmail ?? ""}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Contact Phone
              </label>
              <input
                type="tel"
                name="contactPhone"
                defaultValue={venue.contactPhone ?? ""}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Access Notes
            </label>
            <textarea
              name="accessNotes"
              rows={2}
              defaultValue={venue.accessNotes ?? ""}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Catering Notes
            </label>
            <textarea
              name="cateringNotes"
              rows={2}
              defaultValue={venue.cateringNotes ?? ""}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Logistics Notes (other)
            </label>
            <textarea
              name="logisticsNotes"
              rows={2}
              defaultValue={venue.logisticsNotes ?? ""}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Waste Rules
            </label>
            <textarea
              name="wasteRules"
              rows={2}
              defaultValue={venue.wasteRules ?? ""}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Permits / Insurance
            </label>
            <textarea
              name="permitsInsuranceNotes"
              rows={2}
              defaultValue={venue.permitsInsuranceNotes ?? ""}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Restrictions
            </label>
            <textarea
              name="restrictions"
              rows={2}
              defaultValue={venue.restrictions ?? ""}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setShowEditForm(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy === "updateDetails"}
            >
              {busy === "updateDetails" ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      )}

      {/* Capacity Change */}
      {venue.status === "active" && (
        <form
          onSubmit={handleChangeCapacity}
          className="rounded-md bg-white p-6 shadow-sm"
        >
          <h3 className="text-lg font-medium">Change Capacity</h3>
          <div className="mt-4 flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">
                New Capacity *
              </label>
              <input
                type="number"
                name="capacity"
                required
                min="1"
                defaultValue={venue.capacity ?? ""}
                placeholder={String(venue.capacity ?? "Enter capacity")}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <button
              className="btn btn-secondary"
              type="submit"
              disabled={busy === "changeCapacity"}
            >
              {busy === "changeCapacity" ? "Updating..." : "Update Capacity"}
            </button>
          </div>
        </form>
      )}

      {/* Venue Information Display */}
      <div className="rounded-md bg-white p-6 shadow-sm">
        <h3 className="text-lg font-medium">Venue Information</h3>
        <dl className="mt-4 space-y-2">
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            <dt className="text-sm font-medium text-gray-500">Status</dt>
            <dd className="col-span-2 text-sm text-gray-900">
              <StatusChip
                status={venue.status === "active" ? "active" : "inactive"}
              />
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            <dt className="text-sm font-medium text-gray-500">Type</dt>
            <dd className="col-span-2 text-sm text-gray-900">
              {VENUE_TYPE_LABELS[venue.venueType as VenueType] ||
                venue.venueType}
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            <dt className="text-sm font-medium text-gray-500">Premise Type</dt>
            <dd className="col-span-2 text-sm text-gray-900">
              {venue.onPremise === true
                ? "On-Premise"
                : venue.onPremise === false
                  ? "Off-Premise"
                  : "Not specified"}
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            <dt className="text-sm font-medium text-gray-500">Capacity</dt>
            <dd className="col-span-2 text-sm text-gray-900">
              {venue.capacity ?? "Not set"}
            </dd>
          </div>
          {/* Logistics features */}
          {(venue.kitchenAccess ||
            venue.loadInInstructions ||
            venue.parkingAvailable !== undefined ||
            venue.hasFreightElevator !== undefined ||
            venue.storageAvailable !== undefined ||
            venue.powerAvailable !== undefined ||
            venue.waterAccess !== undefined ||
            venue.hasStairs !== undefined ||
            venue.wasteRules ||
            venue.permitsInsuranceNotes ||
            venue.restrictions ||
            venue.logisticsNotes) && (
            <div className="mt-4 rounded-md bg-gray-50 p-3">
              <dt className="text-sm font-medium text-gray-700 mb-2">
                Logistics Features
              </dt>
              <div className="space-y-1 text-sm text-gray-900">
                {venue.kitchenAccess && (
                  <div>
                    <span className="font-medium">Kitchen Access:</span>{" "}
                    {venue.kitchenAccess}
                  </div>
                )}
                {venue.loadInInstructions && (
                  <div>
                    <span className="font-medium">Load-in:</span>{" "}
                    {venue.loadInInstructions}
                  </div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {venue.parkingAvailable !== undefined && (
                    <span>
                      {venue.parkingAvailable ? "✓" : "✗"} Parking Available
                    </span>
                  )}
                  {venue.hasFreightElevator !== undefined && (
                    <span>
                      {venue.hasFreightElevator ? "✓" : "✗"} Freight Elevator
                    </span>
                  )}
                  {venue.storageAvailable !== undefined && (
                    <span>
                      {venue.storageAvailable ? "✓" : "✗"} Storage Available
                    </span>
                  )}
                  {venue.powerAvailable !== undefined && (
                    <span>
                      {venue.powerAvailable ? "✓" : "✗"} Power Available
                    </span>
                  )}
                  {venue.waterAccess !== undefined && (
                    <span>{venue.waterAccess ? "✓" : "✗"} Water Access</span>
                  )}
                  {venue.hasStairs !== undefined && (
                    <span>{venue.hasStairs ? "✓" : "✗"} Stairs</span>
                  )}
                </div>
                {venue.wasteRules && (
                  <div>
                    <span className="font-medium">Waste Rules:</span>{" "}
                    <span className="whitespace-pre-wrap text-gray-700">
                      {venue.wasteRules}
                    </span>
                  </div>
                )}
                {venue.permitsInsuranceNotes && (
                  <div>
                    <span className="font-medium">Permits / Insurance:</span>{" "}
                    <span className="whitespace-pre-wrap text-gray-700">
                      {venue.permitsInsuranceNotes}
                    </span>
                  </div>
                )}
                {venue.restrictions && (
                  <div>
                    <span className="font-medium">Restrictions:</span>{" "}
                    <span className="whitespace-pre-wrap text-gray-700">
                      {venue.restrictions}
                    </span>
                  </div>
                )}
                {venue.logisticsNotes && (
                  <div className="whitespace-pre-wrap text-gray-700">
                    {venue.logisticsNotes}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            <dt className="text-sm font-medium text-gray-500">Address</dt>
            <dd className="col-span-2 text-sm text-gray-900">
              {[
                venue.addressLine1,
                venue.addressLine2,
                venue.city,
                venue.region,
                venue.postalCode,
              ]
                .filter(Boolean)
                .join(", ") || "Not set"}
            </dd>
          </div>
          {(venue.contactName || venue.contactEmail || venue.contactPhone) && (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-sm font-medium text-gray-500">Contact</dt>
              <dd className="col-span-2 text-sm text-gray-900">
                {venue.contactName && <div>{venue.contactName}</div>}
                {venue.contactEmail && (
                  <div>
                    <a
                      href={`mailto:${venue.contactEmail}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      {venue.contactEmail}
                    </a>
                  </div>
                )}
                {venue.contactPhone && (
                  <div>
                    <a
                      href={`tel:${venue.contactPhone}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      {venue.contactPhone}
                    </a>
                  </div>
                )}
              </dd>
            </div>
          )}
          {venue.accessNotes && (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-sm font-medium text-gray-500">
                Access Notes
              </dt>
              <dd className="col-span-2 text-sm text-gray-900 whitespace-pre-wrap">
                {venue.accessNotes}
              </dd>
            </div>
          )}
          {venue.cateringNotes && (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-sm font-medium text-gray-500">
                Catering Notes
              </dt>
              <dd className="col-span-2 text-sm text-gray-900 whitespace-pre-wrap">
                {venue.cateringNotes}
              </dd>
            </div>
          )}
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            <dt className="text-sm font-medium text-gray-500">Registered</dt>
            <dd className="col-span-2 text-sm text-gray-900">
              {venue.registeredAt
                ? new Date(venue.registeredAt).toLocaleDateString()
                : "Not registered"}
            </dd>
          </div>
          {venue.deactivatedAt && (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-sm font-medium text-gray-500">Deactivated</dt>
              <dd className="col-span-2 text-sm text-gray-900">
                {new Date(venue.deactivatedAt).toLocaleDateString()}
                {venue.deactivationReason && ` (${venue.deactivationReason})`}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Venue Notes */}
      <VenueNotesPanel venueId={venue._id} />

      {/* Danger Zone */}
      {venue.status === "active" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-6">
          <h3 className="text-lg font-medium text-red-900">Danger Zone</h3>
          <p className="mt-2 text-sm text-red-700">
            Deactivating a venue will mark it as inactive. It will no longer
            appear in dropdowns for new events, but will remain visible in
            historical event records.
          </p>
          <button
            className="btn btn-danger mt-4"
            type="button"
            onClick={handleDeactivate}
            disabled={busy === "deactivate"}
          >
            {busy === "deactivate" ? "Deactivating..." : "Deactivate Venue"}
          </button>
        </div>
      )}
    </div>
  );
}
