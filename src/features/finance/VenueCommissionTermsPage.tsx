import { useMemo, useState, type FormEvent } from "react";
import {
  useCreateVenueCommissionTerm,
  useListVenueCommissionTerm,
  useListVenue,
  useVenueCommissionTermRevise,
  useVenueCommissionTermRetire,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { formatDate as formatDateShared } from "../../lib/format";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";

const formatDate = (date: string | number | null | undefined) => {
  if (!date) return "—";
  return formatDateShared(new Date(date).getTime());
};

const termStatus = (term: {
  deletedAt?: unknown;
  retiredAt?: unknown;
  effectiveEndDate?: unknown;
}) => {
  if (term.deletedAt) return "archived";
  if (term.retiredAt) return "retired";
  if (
    term.effectiveEndDate &&
    new Date(term.effectiveEndDate as string) < new Date()
  )
    return "expired";
  return "active";
};

export function VenueCommissionTermsPage() {
  const venueTerms = useListVenueCommissionTerm();
  const venues = useListVenue();
  // Creation path: the governed create hook (VenueCommissionTerm_createViaDefine),
  // not the entity-command hook which targets an existing doc via docId.
  const defineTerm = useCreateVenueCommissionTerm();
  const reviseTerm = useVenueCommissionTermRevise();
  const retire = useVenueCommissionTermRetire();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const configuredTerms = (venueTerms ?? [])
    .filter((term) => term.deletedAt == null)
    .sort((a, b) => {
      const venueA = venues?.find((v) => v._id === a.venueId);
      const venueB = venues?.find((v) => v._id === b.venueId);
      return String(venueA?.name ?? "").localeCompare(
        String(venueB?.name ?? ""),
      );
    });
  const editing = configuredTerms.find((term) => term._id === editingId);

  const activeCount = configuredTerms.filter(
    (term) => term.retiredAt == null && term.deletedAt == null,
  ).length;

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    setFailure(null);
    setNotice(null);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitTerm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    // Disabled selects are excluded from FormData, so a revise keeps the
    // term's existing venue.
    const venueId = editing
      ? String(editing.venueId)
      : (data.get("venueId") as string);
    const commissionPercent = Number(data.get("commissionPercent"));
    const effectiveStartDate = data.get("effectiveStartDate") as string;
    const effectiveEndDate =
      (data.get("effectiveEndDate") as string | null) || null;
    const notes = String(data.get("notes") ?? "").trim() || undefined;

    if (!venueId) {
      setFailure(new Error("Select a venue for this commission term."));
      return;
    }
    if (!(commissionPercent >= 0 && commissionPercent <= 100)) {
      setFailure(new Error("Commission percent must be between 0 and 100."));
      return;
    }
    if (!effectiveStartDate) {
      setFailure(new Error("Effective start date is required."));
      return;
    }

    const params = {
      venueId,
      commissionPercent,
      effectiveStartDate: new Date(effectiveStartDate).toISOString(),
      effectiveEndDate: effectiveEndDate
        ? new Date(effectiveEndDate).toISOString()
        : undefined,
      notes,
    };

    void run(editing ? `revise:${editing._id}` : "define", async () => {
      if (editing) {
        await reviseTerm({
          docId: editing._id,
          version: editing.version,
          ...params,
        });
      } else {
        await defineTerm(params);
      }
      setEditingId(null);
      form.reset();
      setNotice(
        editing
          ? "Commission term updated."
          : "Commission term defined and active.",
      );
    });
  };

  const retireTerm = (term: {
    _id: string;
    version: number;
    venueId?: unknown;
  }) => {
    const venue = venues?.find((v) => v._id === term.venueId);
    void run(`retire:${term._id}`, async () => {
      await retire({
        docId: term._id,
        version: term.version,
      });
      setNotice(`Commission term for ${venue?.name ?? "venue"} retired.`);
    });
  };

  if (venueTerms === undefined || venues === undefined) {
    return (
      <div className="operations-stage supply-stage tax-stage">
        <TableSkeleton rows={7} />
      </div>
    );
  }

  return (
    <div className="operations-stage supply-stage tax-stage">
      <header className="supply-masthead tax-masthead">
        <div>
          <p className="eyebrow">Finance · Commission desk</p>
          <h1 className="display-title mt-2">Venue commission terms</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Define venue commission rates with effective dating. Commissions
            calculate automatically when attributing event revenue.
          </p>
        </div>
        <div className="tax-period-stamp" aria-label="Commission terms status">
          <span>Active terms</span>
          <strong>{activeCount}</strong>
          <small>{configuredTerms.length} configured</small>
        </div>
      </header>
      <FinanceWorkspaceNav />
      {failure ? <FinanceFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-[13px] text-ink-2" role="status">
          {notice}
        </p>
      ) : null}

      <section className="tax-config-grid">
        <form
          className="supply-form tax-rate-form"
          onSubmit={submitTerm}
          key={editing?._id ?? "new-term"}
        >
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Configuration</p>
              <h2>{editing ? "Revise term" : "Define commission term"}</h2>
            </div>
            {editing ? (
              <button
                className="text-link"
                type="button"
                onClick={() => setEditingId(null)}
              >
                Cancel
              </button>
            ) : null}
          </div>
          <label className="field-label">
            Venue
            <select
              className="input"
              name="venueId"
              required
              disabled={!!editing}
              defaultValue={editing ? String(editing.venueId) : ""}
            >
              <option value="">Select venue…</option>
              {venues
                .filter((v) => v.deletedAt == null)
                .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                .map((venue) => (
                  <option key={venue._id} value={venue._id}>
                    {venue.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field-label">
            Commission percent
            <div className="tax-percent-input">
              <input
                className="input"
                name="commissionPercent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                defaultValue={editing ? Number(editing.commissionPercent) : ""}
                placeholder="15.00"
              />
              <span>%</span>
            </div>
          </label>
          <label className="field-label">
            Effective start date
            <input
              className="input"
              name="effectiveStartDate"
              type="date"
              required
              defaultValue={
                editing
                  ? new Date(editing.effectiveStartDate)
                      .toISOString()
                      .split("T")[0]
                  : ""
              }
            />
          </label>
          <label className="field-label">
            Effective end date
            <input
              className="input"
              name="effectiveEndDate"
              type="date"
              defaultValue={
                editing?.effectiveEndDate
                  ? new Date(editing.effectiveEndDate)
                      .toISOString()
                      .split("T")[0]
                  : ""
              }
            />
            <small className="field-help">
              Optional; leave blank for indefinite term
            </small>
          </label>
          <label className="field-label">
            Notes
            <textarea
              className="input"
              name="notes"
              rows={2}
              defaultValue={editing?.notes ?? ""}
              placeholder="Terms, conditions, or special arrangements…"
            />
          </label>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy != null}
          >
            {busy === "define" || busy?.startsWith("revise:")
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Define term"}
          </button>
        </form>

        <div className="tax-rate-register">
          <div className="ledger-heading">
            <div>
              <p className="eyebrow">Term register</p>
              <h2>Configured terms</h2>
            </div>
            <span>{configuredTerms.length}</span>
          </div>
          {configuredTerms.length === 0 ? (
            <div className="document-empty">
              <p>No commission terms yet.</p>
              <span>
                Define the first term; venue commissions will calculate when
                attributing event revenue.
              </span>
            </div>
          ) : (
            <div className="tax-rate-list">
              {configuredTerms.map((term) => {
                const venue = venues?.find((v) => v._id === term.venueId);
                return (
                  <article className="tax-rate-card" key={term._id}>
                    <div>
                      <StatusChip status={termStatus(term)} />
                      <h3>{venue?.name ?? "Unknown venue"}</h3>
                      <div className="tax-category-chips">
                        <span>
                          {Number(term.commissionPercent).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <div>
                      <small className="text-ink-2">
                        {formatDate(term.effectiveStartDate)}
                        {" → "}
                        {formatDate(term.effectiveEndDate)}
                      </small>
                    </div>
                    <div className="tax-rate-actions">
                      <button
                        className="text-link"
                        type="button"
                        onClick={() => setEditingId(term._id)}
                        disabled={term.retiredAt != null}
                      >
                        Edit
                      </button>
                      {term.retiredAt == null ? (
                        <button
                          className="text-link text-ink-2"
                          type="button"
                          disabled={busy != null}
                          onClick={() => retireTerm(term)}
                        >
                          Retire
                        </button>
                      ) : (
                        <span className="text-ink-2 text-sm">Retired</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
