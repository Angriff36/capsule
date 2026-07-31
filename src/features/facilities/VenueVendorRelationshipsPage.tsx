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
import { PageHeader, StatusChip, TableSkeleton } from "../../ui/primitives";
import { useActionPrompt } from "../../ui/action-prompt";
import { FacilitiesWorkspaceNav } from "./FacilitiesWorkspaceNav";
import { formatDate } from "../../lib/format";
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
    color: "bg-ok-soft text-ok",
  },
  { value: "approved", label: "Approved", color: "bg-info-soft text-info" },
  {
    value: "restricted",
    label: "Restricted",
    color: "bg-warn-soft text-warn",
  },
  { value: "banned", label: "Banned", color: "bg-danger-soft text-danger" },
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
  const { prompt, host } = useActionPrompt(busy != null);

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

      // Both selects are `required`, so native validation blocks empty values
      // before submit; these guards are a belt-and-suspenders no-op.
      if (!targetVenueId || !targetVendorId) return;

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

  // Generated command hooks read `docId` (not `id`) — passing `id` leaves
  // docId undefined and the mutation rejects every call.
  const handleStatusChange = (id: string, newStatus: StatusValue) => {
    void run(`status-${id}`, async () => {
      await reviseStatus({
        docId: id,
        status: newStatus,
      });
    });
  };

  const handleRetire = async (id: string, vendorName: string) => {
    const reason = await prompt.askReason({
      title: "Retire relationship",
      description: `Retire the relationship with ${vendorName}.`,
      label: "Reason",
      confirmLabel: "Retire relationship",
      tone: "danger",
    });
    if (!reason?.trim()) return;

    void run(`retire-${id}`, async () => {
      await retireRelationship({
        docId: id,
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
      <PageHeader
        title="Venue vendor relationships"
        lead={
          venue
            ? `Vendor policies for ${venue.name}`
            : "Venue-specific vendor policies and status"
        }
        actions={
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="btn btn-primary"
          >
            {showForm ? "Cancel" : "New relationship"}
          </button>
        }
      />
      <FacilitiesWorkspaceNav />
      {host}

      {failure && (
        <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
      )}

      {showForm && (
        <form
          onSubmit={submit}
          className="space-y-4 rounded-xs bg-panel p-6 shadow"
        >
          <h2 className="text-lg font-semibold text-ink">
            Establish Vendor Relationship
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-2">
                Venue *
              </label>
              <select
                name="venueId"
                required
                disabled={!!venueId}
                defaultValue={venueId ?? ""}
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm focus:border-accent sm:text-xs"
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
              <label className="block text-xs font-medium text-ink-2">
                Vendor *
              </label>
              <select
                name="vendorId"
                required
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm focus:border-accent sm:text-xs"
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
              <label className="block text-xs font-medium text-ink-2">
                Category *
              </label>
              <select
                name="category"
                required
                defaultValue="other"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm focus:border-accent sm:text-xs"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-2">
                Status *
              </label>
              <select
                name="status"
                required
                defaultValue="approved"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm focus:border-accent sm:text-xs"
              >
                {STATUSES.map((st) => (
                  <option key={st.value} value={st.value}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-2">
                Effective From
              </label>
              <input
                type="date"
                name="effectiveFrom"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm focus:border-accent sm:text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-2">
                Effective Until
              </label>
              <input
                type="date"
                name="effectiveUntil"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm focus:border-accent sm:text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-2">
                Discount Percent
              </label>
              <input
                type="number"
                name="discountPercent"
                min="0"
                max="100"
                step="0.01"
                placeholder="0.00"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm focus:border-accent sm:text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-2">
                Minimum Order
              </label>
              <input
                type="number"
                name="minimumOrder"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm focus:border-accent sm:text-xs"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-2">
                Payment Terms
              </label>
              <input
                type="text"
                name="paymentTerms"
                placeholder="e.g., Net 30"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm focus:border-accent sm:text-xs"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-2">
                Insurance Certificate
              </label>
              <input
                type="text"
                name="insuranceCertificate"
                placeholder="Certificate number or reference"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm focus:border-accent sm:text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-2">
                Insurance Expiry
              </label>
              <input
                type="date"
                name="insuranceExpiry"
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm focus:border-accent sm:text-xs"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-2">
                Compliance Notes
              </label>
              <textarea
                name="complianceNotes"
                rows={2}
                placeholder="Special requirements, certifications, etc."
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm focus:border-accent sm:text-xs"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-2">
                Notes
              </label>
              <textarea
                name="notes"
                rows={2}
                placeholder="Additional notes..."
                className="mt-1 block w-full rounded-sm border-line-2 shadow-sm focus:border-accent sm:text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy === "establish"}
              className="btn btn-primary"
            >
              {busy === "establish"
                ? "Establishing..."
                : "Establish Relationship"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xs bg-panel shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-inset">
              <tr>
                <th className="px-6 py-3 text-left text-2xs font-medium uppercase text-ink-3">
                  Venue
                </th>
                <th className="px-6 py-3 text-left text-2xs font-medium uppercase text-ink-3">
                  Vendor
                </th>
                <th className="px-6 py-3 text-left text-2xs font-medium uppercase text-ink-3">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-2xs font-medium uppercase text-ink-3">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-2xs font-medium uppercase text-ink-3">
                  Effective
                </th>
                <th className="px-6 py-3 text-left text-2xs font-medium uppercase text-ink-3">
                  Discount
                </th>
                <th className="px-6 py-3 text-right text-2xs font-medium uppercase text-ink-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {relationships === undefined || vendors === undefined ? (
                <TableSkeleton columns={7} rows={5} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-ink-3">
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
                    <tr key={row._id} className={isExpired ? "bg-inset" : ""}>
                      <td className="whitespace-nowrap px-6 py-4">
                        {venueId ? (
                          <span>{getVenueName(row.venueId)}</span>
                        ) : (
                          <Link
                            to={venueDetailPath(row.venueId)}
                            className="font-medium text-brand hover:underline"
                          >
                            {getVenueName(row.venueId)}
                          </Link>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {getVendorName(row.vendorId)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-xs text-ink">
                        {categoryLabel(row.category)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <StatusChip
                          status={row.status}
                          label={statusLabel(row.status)}
                          color={statusInfo?.color}
                        />
                        {isExpired && (
                          <span className="ml-2 text-2xs text-danger">
                            (Expired)
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-xs text-ink-3">
                        {row.effectiveFrom
                          ? formatDate(row.effectiveFrom)
                          : "-"}
                        {" → "}
                        {row.effectiveUntil
                          ? formatDate(row.effectiveUntil)
                          : "Ongoing"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-xs text-ink">
                        {row.discountPercent ? `${row.discountPercent}%` : "-"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-xs">
                        <select
                          value={row.status}
                          onChange={(e) =>
                            handleStatusChange(
                              row._id,
                              e.target.value as StatusValue,
                            )
                          }
                          disabled={busy === `status-${row._id}`}
                          className="rounded-xs border-line-2 text-xs focus:border-accent disabled:opacity-50"
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
                            void handleRetire(
                              row._id,
                              getVendorName(row.vendorId),
                            )
                          }
                          disabled={busy === `retire-${row._id}`}
                          className="ml-2 text-danger hover:underline disabled:opacity-50"
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
          <div className="border-t border-line bg-inset px-6 py-3">
            <Link
              to={venueVendorRelationshipsListPath()}
              className="text-xs font-medium text-brand hover:underline"
            >
              View all vendor relationships →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
