import { useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useCreateVenueVendorRelationship,
  useVenueVendorRelationshipReviseStatus,
  useVenueVendorRelationshipRetire,
  useListVenueVendorRelationship,
  useListVenue,
  useListVendor,
} from "../../lib/manifest-convex-react";
import {
  venueDetailPath,
  venueVendorRelationshipsListPath,
} from "./facilitiesRoutes";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import {
  classifyCommandFailure,
  type CommandFailure,
} from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";

// Enum values from manifest
const CATEGORIES = [
  { value: "catering_equipment", label: "Catering Equipment" },
  { value: "florist", label: "Florist" },
  { value: "linens", label: "Linens" },
  { value: "audio_visual", label: "Audio/Visual" },
  { value: "tent_rental", label: "Tent Rental" },
  { value: "furniture_rental", label: "Furniture Rental" },
  { value: "tableware_china", label: "Tableware/China" },
  { value: "glassware", label: "Glassware" },
  { value: "flatware", label: "Flatware" },
  { value: "transportation", label: "Transportation" },
  { value: "waste_management", label: "Waste Management" },
  { value: "security", label: "Security" },
  { value: "photography_videography", label: "Photography/Videography" },
  { value: "entertainment", label: "Entertainment" },
  { value: "other", label: "Other" },
] as const;

const STATUSES = [
  {
    value: "preferred",
    label: "Preferred",
    color: "bg-green-100 text-green-800",
  },
  { value: "approved", label: "Approved", color: "bg-blue-100 text-blue-800" },
  {
    value: "restricted",
    label: "Restricted",
    color: "bg-yellow-100 text-yellow-800",
  },
  { value: "banned", label: "Banned", color: "bg-red-100 text-red-800" },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]["value"];
type StatusValue = (typeof STATUSES)[number]["value"];

// <input type="date"> yields "YYYY-MM-DD"; the manifest stores these as
// datetime (epoch-ms), so convert before sending.
const toDateEpoch = (raw: FormDataEntryValue | null): number | undefined => {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : ms;
};

/** Venue vendor relationships page — manage venue-specific vendor policies. */
export function VenueVendorRelationshipsPage() {
  const { venueId } = useParams<{ venueId: string }>();
  const relationships = useListVenueVendorRelationship();
  const venues = useListVenue();
  const vendors = useListVendor();

  const createRelationship = useCreateVenueVendorRelationship();
  const reviseStatus = useVenueVendorRelationshipReviseStatus();
  const retireRelationship = useVenueVendorRelationshipRetire();

  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);

  const venue = useMemo(
    () => (venues ?? []).find((v) => v._id === venueId && v.deletedAt == null),
    [venues, venueId],
  );

  const rows = useMemo(
    () =>
      (relationships ?? [])
        .filter(
          (r) => r.deletedAt == null && (!venueId || r.venueId === venueId),
        )
        .sort((a, b) => {
          // Sort by status (banned last), then category, then vendor name
          const aStatus = a.status;
          const bStatus = b.status;
          if (aStatus !== bStatus) {
            if (aStatus === "banned") return 1;
            if (bStatus === "banned") return -1;
          }
          return a.category.localeCompare(b.category);
        }),
    [relationships, venueId],
  );

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);

    void run("establish", async () => {
      const targetVenueId = venueId || String(data.get("venueId") ?? "").trim();
      const targetVendorId = String(data.get("vendorId") ?? "").trim();

      if (!targetVenueId) {
        alert("Venue is required");
        return;
      }
      if (!targetVendorId) {
        alert("Vendor is required");
        return;
      }

      await createRelationship({
        venueId: targetVenueId,
        vendorId: targetVendorId,
        category: (data.get("category") ?? "other") as CategoryValue,
        status: (data.get("status") ?? "approved") as StatusValue,
        effectiveFrom: toDateEpoch(data.get("effectiveFrom")),
        effectiveUntil: toDateEpoch(data.get("effectiveUntil")),
        primaryContactId:
          String(data.get("primaryContactId") || "").trim() || undefined,
        insuranceCertificate:
          String(data.get("insuranceCertificate") || "").trim() || undefined,
        insuranceExpiry: toDateEpoch(data.get("insuranceExpiry")),
        complianceNotes:
          String(data.get("complianceNotes") || "").trim() || undefined,
        discountPercent:
          Number(data.get("discountPercent") || "0") || undefined,
        paymentTerms:
          String(data.get("paymentTerms") || "").trim() || undefined,
        minimumOrder: Number(data.get("minimumOrder") || "0") || undefined,
        notes: String(data.get("notes") || "").trim() || undefined,
      });
      element.reset();
      setShowForm(false);
    });
  };

  const handleStatusChange = (id: string, newStatus: StatusValue) => {
    void run(`status-${id}`, async () => {
      await reviseStatus({
        id,
        status: newStatus,
      });
    });
  };

  const handleRetire = (id: string, vendorName: string) => {
    const reason = prompt(`Retire relationship with ${vendorName}. Reason:`);
    if (!reason?.trim()) return;

    void run(`retire-${id}`, async () => {
      await retireRelationship({
        id,
        reason: reason.trim(),
      });
    });
  };

  const statusLabel = (status: StatusValue) =>
    STATUSES.find((s) => s.value === status)?.label ?? status;

  const categoryLabel = (category: CategoryValue) =>
    CATEGORIES.find((c) => c.value === category)?.label ?? category;

  const getVendorName = (vendorId: string) => {
    const vendor = (vendors ?? []).find((v) => v._id === vendorId);
    return vendor?.name ?? vendorId;
  };

  const getVenueName = (vId: string) => {
    const v = (venues ?? []).find((venue) => venue._id === vId);
    return v?.name ?? vId;
  };

  const filteredVendors = useMemo(
    () =>
      (vendors ?? []).filter(
        (v) => v.deletedAt == null && v.onboardedAt != null,
      ),
    [vendors],
  );

  const filteredVenues = useMemo(
    () => (venues ?? []).filter((v) => v.deletedAt == null),
    [venues],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Venue Vendor Relationships
          </h1>
          <p className="text-sm text-gray-500">
            {venue
              ? `Vendor policies for ${venue.name}`
              : "Manage venue-specific vendor policies and status"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          {showForm ? "Cancel" : "New Relationship"}
        </button>
      </div>

      {failure && (
        <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
      )}

      {showForm && (
        <form
          onSubmit={submit}
          className="space-y-4 rounded bg-white p-6 shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900">
            Establish Vendor Relationship
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Venue *
              </label>
              <select
                name="venueId"
                required
                disabled={!!venueId}
                defaultValue={venueId ?? ""}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
                <option value="">Select venue...</option>
                {filteredVenues.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Vendor *
              </label>
              <select
                name="vendorId"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
                <option value="">Select vendor...</option>
                {filteredVendors.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Category *
              </label>
              <select
                name="category"
                required
                defaultValue="other"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Status *
              </label>
              <select
                name="status"
                required
                defaultValue="approved"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
                {STATUSES.map((st) => (
                  <option key={st.value} value={st.value}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Effective From
              </label>
              <input
                type="date"
                name="effectiveFrom"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Effective Until
              </label>
              <input
                type="date"
                name="effectiveUntil"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Discount Percent
              </label>
              <input
                type="number"
                name="discountPercent"
                min="0"
                max="100"
                step="0.01"
                placeholder="0.00"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Minimum Order
              </label>
              <input
                type="number"
                name="minimumOrder"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Payment Terms
              </label>
              <input
                type="text"
                name="paymentTerms"
                placeholder="e.g., Net 30"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Insurance Certificate
              </label>
              <input
                type="text"
                name="insuranceCertificate"
                placeholder="Certificate number or reference"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Insurance Expiry
              </label>
              <input
                type="date"
                name="insuranceExpiry"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Compliance Notes
              </label>
              <textarea
                name="complianceNotes"
                rows={2}
                placeholder="Special requirements, certifications, etc."
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Notes
              </label>
              <textarea
                name="notes"
                rows={2}
                placeholder="Additional notes..."
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy === "establish"}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy === "establish"
                ? "Establishing..."
                : "Establish Relationship"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded bg-white shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Venue
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Vendor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Effective
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Discount
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {relationships === undefined || vendors === undefined ? (
                <TableSkeleton columns={7} rows={5} />
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    No vendor relationships found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const statusInfo = STATUSES.find(
                    (s) => s.value === row.status,
                  );
                  const isExpired = row.effectiveUntil
                    ? new Date(row.effectiveUntil) < new Date()
                    : false;

                  return (
                    <tr key={row._id} className={isExpired ? "bg-gray-50" : ""}>
                      <td className="whitespace-nowrap px-6 py-4">
                        {venueId ? (
                          <span>{getVenueName(row.venueId)}</span>
                        ) : (
                          <Link
                            to={venueDetailPath(row.venueId)}
                            className="font-medium text-indigo-600 hover:text-indigo-900"
                          >
                            {getVenueName(row.venueId)}
                          </Link>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {getVendorName(row.vendorId)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                        {categoryLabel(row.category)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <StatusChip
                          status={row.status}
                          label={statusLabel(row.status)}
                          color={statusInfo?.color}
                        />
                        {isExpired && (
                          <span className="ml-2 text-xs text-red-600">
                            (Expired)
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {row.effectiveFrom
                          ? new Date(row.effectiveFrom).toLocaleDateString()
                          : "-"}
                        {" → "}
                        {row.effectiveUntil
                          ? new Date(row.effectiveUntil).toLocaleDateString()
                          : "Ongoing"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                        {row.discountPercent ? `${row.discountPercent}%` : "-"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                        <select
                          value={row.status}
                          onChange={(e) =>
                            handleStatusChange(
                              row._id,
                              e.target.value as StatusValue,
                            )
                          }
                          disabled={busy === `status-${row._id}`}
                          className="rounded border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          {STATUSES.map((st) => (
                            <option key={st.value} value={st.value}>
                              {st.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            handleRetire(row._id, getVendorName(row.vendorId))
                          }
                          disabled={busy === `retire-${row._id}`}
                          className="ml-2 text-red-600 hover:text-red-900 disabled:opacity-50"
                        >
                          Retire
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {venueId && (
          <div className="border-t border-gray-200 bg-gray-50 px-6 py-3">
            <Link
              to={venueVendorRelationshipsListPath()}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-900"
            >
              View all vendor relationships →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
