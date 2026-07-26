import { useState } from "react";
import { Link } from "react-router-dom";
import { useAction } from "convex/react";
import { api } from "../../lib/api";
import { useListQuoteSubmission } from "../../lib/manifest-convex-react";
import { classifyCommandFailure } from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";
import { formatDate } from "../../lib/format";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { ClientsWorkspaceNav } from "../clients/ClientsWorkspaceNav";
import type { Doc } from "../../lib/api";

type QuoteSubmission = Doc<"quoteSubmissions">;
type Failure = ReturnType<typeof classifyCommandFailure>;

// A submission is convertible while pending. The manifest transitions are
// pending → processing → completed|failed, and failed is terminal (no reopen),
// so failed submissions are shown for awareness but cannot be retried from here.
function isActionable(sub: QuoteSubmission): boolean {
  if (sub.deletedAt != null) return false;
  return sub.status === "pending";
}

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

/**
 * Sales review queue for self-service quote submissions captured from the
 * public /quote form. Sales staff convert a captured submission into a real
 * Lead, Event, and draft Proposal in one click (processQuoteSubmission runs
 * with their own auth, so the sales-guarded creates succeed).
 */
export function QuoteSubmissionsReviewPage() {
  const submissions = useListQuoteSubmission();
  const process = useAction(api.quoteBuilder.processQuoteSubmission);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [partialErrors, setPartialErrors] = useState<string | null>(null);
  const [lastConverted, setLastConverted] = useState<{
    clientName: string;
    eventId: string | null;
    leadId: string | null;
  } | null>(null);

  const convert = async (id: string, clientName: string) => {
    setFailure(null);
    setPartialErrors(null);
    setBusyId(id);
    try {
      const result = await process({
        submissionId: id as Doc<"quoteSubmissions">["_id"],
      });
      if (result.errors.length > 0) {
        // Conversion did not complete all steps — the submission is now failed
        // (terminal). Do NOT show the green success banner; surface the per-step
        // errors for manual reconciliation.
        setPartialErrors(
          `Conversion incomplete — some steps failed: ${result.errors.join(
            "; ",
          )}. The submission is marked failed. Any records that were created exist in their respective lists.`,
        );
      } else {
        setLastConverted({
          clientName,
          eventId: result.eventId,
          leadId: result.leadId,
        });
      }
    } catch (err) {
      setFailure(classifyCommandFailure(err));
    } finally {
      setBusyId(null);
    }
  };

  if (submissions === undefined) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-stone-900 mb-4">
          Quote Requests
        </h1>
        <TableSkeleton />
      </div>
    );
  }

  const visible = [...submissions]
    .filter((sub) => sub.deletedAt == null)
    .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
  const pendingCount = visible.filter(isActionable).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <ClientsWorkspaceNav />
      <div className="flex items-center justify-between mb-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Quote Requests</h1>
          <p className="text-sm text-stone-500 mt-1">
            Self-service submissions from the public quote form.{" "}
            {pendingCount > 0 ? (
              <span className="text-amber-700 font-medium">
                {pendingCount} awaiting conversion
              </span>
            ) : (
              <span>All caught up.</span>
            )}
          </p>
        </div>
        <Link
          to="/clients/pipeline"
          className="text-sm text-stone-600 hover:text-stone-900 underline"
        >
          View lead pipeline →
        </Link>
      </div>

      {failure && (
        <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
      )}
      {partialErrors && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          {partialErrors}
        </div>
      )}

      {lastConverted && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-900">
          <p className="font-medium">
            Converted “{lastConverted.clientName}” into a lead, event, and draft
            proposal.
          </p>
          <p className="mt-1">
            {lastConverted.eventId && (
              <Link
                to={`/events/${lastConverted.eventId}`}
                className="underline mr-3"
              >
                Open event →
              </Link>
            )}
            {lastConverted.leadId && (
              <Link to="/clients/pipeline" className="underline">
                See in pipeline →
              </Link>
            )}
          </p>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-stone-500 italic">
          No quote requests yet. Submissions from the public{" "}
          <Link to="/quote" className="underline">
            /quote
          </Link>{" "}
          form appear here for conversion.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((sub) => (
            <div
              key={sub._id}
              className="bg-white border border-stone-200 rounded-lg p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-stone-900 truncate">
                      {sub.clientName ?? "Unknown"}
                    </h2>
                    <StatusChip
                      status={sub.status ?? "pending"}
                      color={STATUS_TONE[sub.status ?? "pending"]}
                    />
                  </div>
                  <p className="text-sm text-stone-600 mt-1">
                    {sub.email}
                    {sub.phone ? ` · ${sub.phone}` : ""}
                  </p>
                </div>
                <div className="text-right text-sm text-stone-600 shrink-0">
                  <div>
                    {sub.eventDate ? formatDate(sub.eventDate) : "No date"}
                  </div>
                  <div>{sub.guestCount ?? 0} guests</div>
                  {sub.submittedAt && (
                    <div className="text-xs text-stone-400">
                      submitted {formatDate(sub.submittedAt)}
                    </div>
                  )}
                </div>
              </div>

              {(sub.venueName || sub.venueAddress) && (
                <p className="text-sm text-stone-600 mt-2">
                  {[sub.venueName, sub.venueAddress]
                    .filter(Boolean)
                    .join(" — ")}
                </p>
              )}

              {(sub.menuPreferences ||
                sub.dietaryRestrictions ||
                sub.notes) && (
                <dl className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                  {sub.menuPreferences && (
                    <div>
                      <dt className="text-xs uppercase text-stone-400">
                        Menu prefs
                      </dt>
                      <dd className="text-stone-700">{sub.menuPreferences}</dd>
                    </div>
                  )}
                  {sub.dietaryRestrictions && (
                    <div>
                      <dt className="text-xs uppercase text-stone-400">
                        Dietary
                      </dt>
                      <dd className="text-stone-700">
                        {sub.dietaryRestrictions}
                      </dd>
                    </div>
                  )}
                  {sub.notes && (
                    <div>
                      <dt className="text-xs uppercase text-stone-400">
                        Notes
                      </dt>
                      <dd className="text-stone-700">{sub.notes}</dd>
                    </div>
                  )}
                </dl>
              )}

              {sub.status === "failed" &&
                (sub.errorMessage || sub.processingErrors) && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-900">
                    {sub.errorMessage && (
                      <div className="font-medium">{sub.errorMessage}</div>
                    )}
                    {sub.processingErrors && (
                      <div className="mt-0.5">{sub.processingErrors}</div>
                    )}
                  </div>
                )}

              {sub.status === "completed" && sub.eventId && (
                <p className="mt-3 text-sm">
                  <Link
                    to={`/events/${sub.eventId}`}
                    className="text-stone-600 underline"
                  >
                    Open converted event →
                  </Link>
                </p>
              )}

              {isActionable(sub) && (
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={busyId === sub._id}
                    onClick={() =>
                      convert(sub._id, sub.clientName ?? "the lead")
                    }
                    className="px-4 py-2 bg-stone-900 text-white text-sm font-medium rounded-lg hover:bg-stone-800 disabled:bg-stone-400 disabled:cursor-not-allowed"
                  >
                    {busyId === sub._id
                      ? "Converting…"
                      : "Convert to lead, event & proposal"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
