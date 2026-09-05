import { useState } from "react";
import { Link } from "react-router-dom";
import { useAction } from "convex/react";
import { api } from "../../lib/api";
import {
  useListOccasion,
  useListOrganization,
  useListQuoteSubmission,
  useListServiceStyle,
  useQuoteSubmissionDismiss,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { classifyCommandFailure } from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";
import { formatCountNoun, formatDate } from "../../lib/format";
import {
  EmptyState,
  PageHeader,
  StatusChip,
  TableSkeleton,
} from "../../ui/primitives";
import { ClientsWorkspaceNav } from "../clients/ClientsWorkspaceNav";
import { CLIENTS_ROUTES } from "../clients/clientsRoutes";
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

// Dismissable while pending or failed (the manifest dismiss guard matches).
// Dismissal keeps the raw row and its dedupKey; it only hides the request from
// the default queue.
function canDismiss(sub: QuoteSubmission): boolean {
  if (sub.deletedAt != null) return false;
  return sub.status === "pending" || sub.status === "failed";
}

type Named = { _id: string; name: string };

// Resolves a catalog id to its name from the full live list, so retired rows
// still resolve on captured submissions (same pattern as EventDetailsCard).
function nameOf(
  rows: readonly Named[] | undefined,
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return rows?.find((row) => row._id === id)?.name ?? null;
}

/**
 * Sales review queue for self-service quote submissions captured from the
 * public /quote form. Sales staff convert a captured submission into a real
 * Lead, Event, and draft Proposal in one click (processQuoteSubmission runs
 * with their own auth, so the sales-guarded creates succeed).
 */
export function QuoteSubmissionsReviewPage() {
  const submissions = useListQuoteSubmission();
  const serviceStyles = useListServiceStyle();
  const occasions = useListOccasion();
  const organizations = useListOrganization();
  const process = useAction(api.quoteBuilder.processQuoteSubmission);
  const dismissSubmission = useQuoteSubmissionDismiss();
  const { prompt, host: promptHost } = useActionPrompt();

  const [showDismissed, setShowDismissed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [partialErrors, setPartialErrors] = useState<string | null>(null);
  const [lastConverted, setLastConverted] = useState<{
    clientName: string;
    eventId: string | null;
    leadId: string | null;
    proposalId: string | null;
  } | null>(null);

  const convert = async (id: string, clientName: string) => {
    setFailure(null);
    setPartialErrors(null);
    setLastConverted(null);
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
          proposalId: result.proposalId,
        });
      }
    } catch (err) {
      setFailure(classifyCommandFailure(err));
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (sub: QuoteSubmission) => {
    setFailure(null);
    // The reason is required (manifest constraint); a blank prompt cancels.
    const reason = (
      await prompt.askReason({
        title: "Dismiss quote request",
        description:
          "Hides this request from the queue. The raw submission is kept and still blocks duplicate submits of the same event.",
        label: "Reason",
        confirmLabel: "Dismiss",
      })
    )?.trim();
    if (!reason) return;
    setBusyId(sub._id);
    try {
      await dismissSubmission({ docId: sub._id, reason });
    } catch (err) {
      setFailure(classifyCommandFailure(err));
    } finally {
      setBusyId(null);
    }
  };

  if (submissions === undefined) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-4">
          <PageHeader title="Quote requests" />
        </div>
        <ClientsWorkspaceNav />
        <TableSkeleton />
      </div>
    );
  }

  // Dismissed rows leave the default queue but stay reachable through the
  // "Show dismissed" toggle (they are retained, never deleted).
  const live = submissions.filter((sub) => sub.deletedAt == null);
  const dismissedCount = live.filter(
    (sub) => sub.status === "dismissed",
  ).length;
  const visible = [...live]
    .filter((sub) => showDismissed || sub.status !== "dismissed")
    .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
  const pendingCount = visible.filter(isActionable).length;

  // The public form resolves its tenant from the ACTIVE organizations row;
  // without one, every public submit is refused (issue #119). Tell staff here
  // instead of leaving the form silently broken — link to where the row is
  // created (BrandingPage's useCreateOrganization).
  const publicFormOffline =
    organizations !== undefined &&
    !organizations.some((org) => org.status === "active");

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <PageHeader
          title="Quote requests"
          lead={
            <>
              Quotes people asked for through your website.{" "}
              {pendingCount > 0 ? (
                <span className="text-warn font-medium">
                  {pendingCount} awaiting conversion
                </span>
              ) : (
                <span>All caught up.</span>
              )}
            </>
          }
          actions={
            <>
              {dismissedCount > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowDismissed((value) => !value)}
                >
                  {showDismissed
                    ? "Hide dismissed"
                    : `Show dismissed (${dismissedCount})`}
                </button>
              )}
              <Link
                to="/clients/pipeline"
                className="text-xs text-ink-2 hover:text-ink underline"
              >
                View lead pipeline →
              </Link>
            </>
          }
        />
      </div>
      <ClientsWorkspaceNav />

      {publicFormOffline && (
        <div className="mb-4 p-3 bg-warn-soft border border-warn/40 rounded-sm text-xs text-warn">
          The public quote form is offline — this workspace has no active
          organization record, so new quote requests are refused. Create one in{" "}
          <Link to="/admin/branding" className="underline font-medium">
            Admin → Branding
          </Link>
          .
        </div>
      )}
      {failure && (
        <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
      )}
      {partialErrors && (
        <div className="mb-4 p-3 bg-warn-soft border border-warn/40 rounded-sm text-xs text-warn">
          {partialErrors}
        </div>
      )}
      {promptHost}

      {lastConverted && (
        <div className="mb-4 p-4 bg-ok-soft border border-ok/40 rounded-sm text-xs text-ok">
          <p className="font-medium">
            Converted “{lastConverted.clientName}” into a lead, event, and draft
            proposal.
          </p>
          <p className="mt-1">
            {lastConverted.proposalId && (
              <Link
                to={CLIENTS_ROUTES.proposal(lastConverted.proposalId)}
                className="underline mr-3"
              >
                Open proposal →
              </Link>
            )}
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
        <EmptyState
          title={
            dismissedCount > 0
              ? "No open quote requests"
              : "No quote requests yet"
          }
          hint="When someone asks for a quote on your website, it lands here."
          action={
            <Link to="/quote" className="btn btn-ghost btn-sm">
              See the quote form your clients use
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((sub) => (
            <div
              key={sub._id}
              className="bg-panel border border-line rounded-sm p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-ink truncate">
                      {sub.clientName ?? "Unknown"}
                    </h2>
                    <StatusChip status={sub.status ?? "pending"} />
                  </div>
                  <p className="text-xs text-ink-2 mt-1">
                    {sub.email}
                    {sub.phone ? ` · ${sub.phone}` : ""}
                  </p>
                  <p className="text-xs text-ink-2 mt-1">
                    Style:{" "}
                    {nameOf(serviceStyles, sub.serviceStyleId) ??
                      sub.serviceStyleText ??
                      "Not specified"}{" "}
                    · Occasion:{" "}
                    {nameOf(occasions, sub.occasionId) ??
                      sub.occasionText ??
                      "Not specified"}
                  </p>
                </div>
                <div className="text-right text-xs text-ink-2 shrink-0">
                  <div>
                    {sub.eventDate ? formatDate(sub.eventDate) : "No date"}
                  </div>
                  <div>{formatCountNoun(sub.guestCount ?? 0, "guest")}</div>
                  {sub.submittedAt && (
                    <div className="text-2xs text-ink-3">
                      submitted {formatDate(sub.submittedAt)}
                    </div>
                  )}
                </div>
              </div>

              {(sub.venueName || sub.venueAddress) && (
                <p className="text-xs text-ink-2 mt-2">
                  {[sub.venueName, sub.venueAddress]
                    .filter(Boolean)
                    .join(" — ")}
                </p>
              )}

              {(sub.menuPreferences ||
                sub.dietaryRestrictions ||
                sub.notes) && (
                <dl className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  {sub.menuPreferences && (
                    <div>
                      <dt className="text-2xs uppercase text-ink-3">
                        Menu prefs
                      </dt>
                      <dd className="text-ink-2">{sub.menuPreferences}</dd>
                    </div>
                  )}
                  {sub.dietaryRestrictions && (
                    <div>
                      <dt className="text-2xs uppercase text-ink-3">Dietary</dt>
                      <dd className="text-ink-2">{sub.dietaryRestrictions}</dd>
                    </div>
                  )}
                  {sub.notes && (
                    <div>
                      <dt className="text-2xs uppercase text-ink-3">Notes</dt>
                      <dd className="text-ink-2">{sub.notes}</dd>
                    </div>
                  )}
                </dl>
              )}

              {sub.status === "failed" &&
                (sub.errorMessage || sub.processingErrors) && (
                  <div className="mt-2 p-2 bg-danger-soft border border-danger/40 rounded-xs text-2xs text-danger">
                    {sub.errorMessage && (
                      <div className="font-medium">{sub.errorMessage}</div>
                    )}
                    {sub.processingErrors && (
                      <div className="mt-0.5">{sub.processingErrors}</div>
                    )}
                  </div>
                )}

              {sub.status === "dismissed" && sub.errorMessage && (
                <div className="mt-2 p-2 bg-mute-soft border border-line-2 rounded-xs text-2xs text-ink-2">
                  Dismissed — {sub.errorMessage}
                </div>
              )}

              {sub.status === "completed" &&
                (sub.eventId || sub.proposalId) && (
                  <p className="mt-3 text-xs">
                    {sub.proposalId && (
                      <Link
                        to={CLIENTS_ROUTES.proposal(sub.proposalId)}
                        className="text-ink-2 underline mr-3"
                      >
                        Open proposal →
                      </Link>
                    )}
                    {sub.eventId && (
                      <Link
                        to={`/events/${sub.eventId}`}
                        className="text-ink-2 underline"
                      >
                        Open converted event →
                      </Link>
                    )}
                  </p>
                )}

              {(isActionable(sub) || canDismiss(sub)) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {isActionable(sub) && (
                    <button
                      type="button"
                      disabled={busyId === sub._id}
                      onClick={() =>
                        convert(sub._id, sub.clientName ?? "the lead")
                      }
                      className="btn btn-primary"
                    >
                      {busyId === sub._id
                        ? "Converting…"
                        : "Convert to lead, event & proposal"}
                    </button>
                  )}
                  {canDismiss(sub) && (
                    <button
                      type="button"
                      disabled={busyId === sub._id}
                      onClick={() => void dismiss(sub)}
                      className="btn btn-ghost"
                    >
                      {busyId === sub._id ? "Dismissing…" : "Dismiss"}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
