import { type FormEvent, useMemo, useState } from "react";
import { useCreateTasting } from "../../lib/manifest-convex-react";
import {
  useLeadsByIds,
  usePagedRows,
  useProposalsByIds,
  useRowsInStatuses,
  useRowsWithEmpty,
} from "../../lib/financeScopedQueries";
import { formatDate, formatTime } from "../../lib/format";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { ClientsWorkspaceNav } from "./ClientsWorkspaceNav";
import { CrmFailureBanner } from "./CrmFailureBanner";
import { TastingDetail } from "./TastingDetail";

const OPEN_LEAD = ["closedAt"];
// Booked and not yet on a proposal: still to taste or to apply.
const OPEN_STATUSES = ["scheduled", "completed"];

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Tasted",
  selectionsApplied: "On proposal",
  cancelled: "Cancelled",
};

export function leadLabel(lead: {
  companyName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
}): string {
  const person = [lead.givenName, lead.familyName].filter(Boolean).join(" ");
  return lead.companyName || person || "Unnamed lead";
}

/**
 * Client tastings: book a tasting for a lead or proposal, pick the sample
 * dishes, see the small prep list, record what the client thought of each
 * dish, then put the approved dishes on the proposal menu.
 */
export function TastingsPage() {
  // Every open tasting (through the status index), the newest finished ones
  // a page at a time; open leads for the booking form; and only the
  // proposals and leads those name.
  const openTastings = useRowsInStatuses("tastings", OPEN_STATUSES);
  const tastingPages = usePagedRows("tastings");
  const tastings =
    openTastings === undefined || tastingPages.rows === undefined
      ? undefined
      : [
          ...new Map(
            [...openTastings, ...tastingPages.rows].map((row) => [
              row._id,
              row,
            ]),
          ).values(),
        ];
  const openLeads = useRowsWithEmpty("leads", OPEN_LEAD);
  const tastingLeads = useLeadsByIds(
    tastings?.map((row) => (row.leadId ? String(row.leadId) : null)),
  );
  const leads = useMemo(
    () =>
      openLeads === undefined || tastingLeads === undefined
        ? undefined
        : [
            ...new Map(
              [...openLeads, ...tastingLeads].map((lead) => [lead._id, lead]),
            ).values(),
          ],
    [openLeads, tastingLeads],
  );
  const proposals = useProposalsByIds(
    leads === undefined || tastings === undefined
      ? undefined
      : [
          ...leads.map((lead) =>
            lead.proposalId ? String(lead.proposalId) : null,
          ),
          ...tastings.map((row) =>
            row.proposalId ? String(row.proposalId) : null,
          ),
        ],
  );
  const createTasting = useCreateTasting();
  const [failure, setFailure] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const liveLeads = (leads ?? []).filter(
    (lead) => lead.deletedAt == null && lead.closedAt == null,
  );
  const liveProposals = (proposals ?? []).filter(
    (proposal) => proposal.deletedAt == null,
  );
  const rows = (tastings ?? [])
    .filter((row) => row.deletedAt == null && row.bookedAt != null)
    .sort((a, b) => Number(b.scheduledAt) - Number(a.scheduledAt));

  const schedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    const scheduledAt = new Date(text("scheduledAt")).getTime();
    setSaving(true);
    setFailure(null);
    try {
      const created = await createTasting({
        scheduledAt: Number.isNaN(scheduledAt) ? 0 : scheduledAt,
        durationMinutes: Number(text("durationMinutes")) || 60,
        guestCount: Number(text("guestCount")) || 1,
        leadId: text("leadId") || undefined,
        proposalId: text("proposalId") || undefined,
        location: text("location") || undefined,
        attendeeNames: text("attendeeNames")
          ? text("attendeeNames")
              .split(",")
              .map((name) => name.trim())
              .filter(Boolean)
          : undefined,
        notes: text("notes") || undefined,
      });
      form.reset();
      setOpenId(String(created.docId));
    } catch (error) {
      setFailure(error);
    } finally {
      setSaving(false);
    }
  };

  const linkLabel = (row: {
    leadId?: string | null;
    proposalId?: string | null;
  }) => {
    const proposal = liveProposals.find((p) => p._id === row.proposalId);
    if (proposal) return String(proposal.title || "Untitled proposal");
    const lead =
      liveLeads.find((l) => l._id === row.leadId) ??
      (leads ?? []).find((l) => l._id === row.leadId);
    return lead ? leadLabel(lead) : "—";
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Clients · Tastings</p>
          <h1 className="display-title mt-2">Client tastings</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Book a tasting, choose the sample dishes, and write down what the
            client liked. Approved dishes go straight onto the proposal menu.
          </p>
        </div>
      </header>
      <ClientsWorkspaceNav />
      {failure ? <CrmFailureBanner error={failure} /> : null}

      <form
        className="mt-4 rounded-sm border border-line bg-inset p-4"
        onSubmit={(event) => void schedule(event)}
      >
        <p className="eyebrow">Book a tasting</p>
        <p className="text-sm text-ink-2">
          Pick the lead or the proposal this tasting is for.
        </p>
        <div className="supply-form-grid mt-3">
          <label className="field-label">
            Lead
            <select name="leadId" className="input" defaultValue="">
              <option value="">No lead</option>
              {liveLeads.map((lead) => (
                <option key={lead._id} value={lead._id}>
                  {leadLabel(lead)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Proposal
            <select name="proposalId" className="input" defaultValue="">
              <option value="">No proposal</option>
              {liveProposals.map((proposal) => (
                <option key={proposal._id} value={proposal._id}>
                  {String(proposal.title || "Untitled proposal")}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Date and time
            <BoundedDateTimeLocalInput
              name="scheduledAt"
              className="input"
              required
            />
          </label>
          <label className="field-label">
            Minutes
            <input
              name="durationMinutes"
              type="number"
              min={1}
              defaultValue={60}
              className="input"
            />
          </label>
          <label className="field-label">
            Guests
            <input
              name="guestCount"
              type="number"
              min={1}
              defaultValue={2}
              className="input"
            />
          </label>
          <label className="field-label">
            Location
            <input name="location" className="input" />
          </label>
          <label className="field-label supply-span-2">
            Who is coming (comma separated)
            <input name="attendeeNames" className="input" />
          </label>
          <label className="field-label">
            Notes
            <input name="notes" className="input" />
          </label>
        </div>
        <button
          className="btn btn-primary mt-3"
          type="submit"
          disabled={saving}
        >
          {saving ? "Booking…" : "Book tasting"}
        </button>
      </form>

      {tastings === undefined ? (
        <TableSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <p className="mt-4 text-base text-ink-2">No tastings booked yet.</p>
      ) : (
        <table className="data-table phone-cards mt-4">
          <thead>
            <tr>
              <th>When</th>
              <th>For</th>
              <th>Guests</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._id}>
                <td>
                  <strong>{formatDate(Number(row.scheduledAt))}</strong>{" "}
                  {formatTime(Number(row.scheduledAt))}
                </td>
                <td data-label="For">{linkLabel(row)}</td>
                <td data-label="Guests">{Number(row.guestCount)}</td>
                <td data-label="Status">
                  <StatusChip
                    status={String(row.status)}
                    label={STATUS_LABEL[String(row.status)]}
                  />
                </td>
                <td>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    aria-expanded={openId === row._id}
                    onClick={() =>
                      setOpenId(openId === row._id ? null : row._id)
                    }
                  >
                    {openId === row._id ? "Close" : "Open"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tastings !== undefined && tastingPages.canLoadMore ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-2"
          disabled={tastingPages.loadingMore}
          onClick={tastingPages.loadMore}
        >
          {tastingPages.loadingMore ? "Loading…" : "Load older tastings"}
        </button>
      ) : null}

      {openId && rows.some((row) => row._id === openId) ? (
        <TastingDetail
          key={openId}
          tasting={rows.find((row) => row._id === openId)!}
          proposals={liveProposals}
          leads={leads ?? []}
          onFailure={setFailure}
        />
      ) : null}
    </div>
  );
}
