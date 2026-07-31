import { useSourceLinksByCapsuleId } from "../../lib/sourceProvenance";

// Spec §5.3 TPP bridge — the two remaining gaps:
//   "Legacy field reconciliation not surfaced in the proposal/event UI"
//   "Missing menu or venue mappings not surfaced before publication
//    (non-blocking warning, not a guard)"
//
// Deliberately NOT a guard. Per docs/architecture/domain-gating-restraint.md a
// caterer must stay able to send a proposal the system thinks is incomplete —
// plenty of real proposals are sent before the venue is locked. This tells the
// operator what is missing and gets out of the way.

const SOURCE_LABEL: Record<string, string> = {
  tpp_legacy: "TPP (legacy)",
  csv_export: "CSV export",
  api_sync: "API sync",
  quickbooks_online: "QuickBooks Online",
  google_calendar: "Google Calendar",
  stripe: "Stripe",
  other: "Other",
};

export interface ProposalReadinessInput {
  /** The proposal's linked event id, if it has one. */
  readonly eventId: string | null | undefined;
  /** Whether the linked event resolves to a venue. */
  readonly hasVenue: boolean;
  /** Whether any dish/menu selection exists for this proposal. */
  readonly hasMenuSelections: boolean;
  /** Whether any priced line item exists for this proposal. */
  readonly hasPricedLines: boolean;
  /** Already-sent proposals are history — warnings are pre-publication only. */
  readonly status: string;
}

const PRE_PUBLICATION = new Set(["draft"]);

export function ProposalReadinessNotice({
  eventId,
  hasVenue,
  hasMenuSelections,
  hasPricedLines,
  status,
}: ProposalReadinessInput) {
  // Provenance of the originating event: for an imported TPP event this is the
  // legacy record the proposal's fields were mapped from.
  const links = useSourceLinksByCapsuleId(eventId ?? null);

  const warnings: string[] = [];
  if (PRE_PUBLICATION.has(status)) {
    if (!eventId) {
      warnings.push(
        "Not linked to an event — timeline and venue sections will be empty.",
      );
    } else if (!hasVenue) {
      warnings.push(
        "The linked event has no venue — venue logistics will be missing.",
      );
    }
    if (!hasMenuSelections) {
      warnings.push("No menu selections yet.");
    }
    if (!hasPricedLines) {
      warnings.push("No priced line items — the total will not itemize.");
    }
  }

  const provenance = links && links.length > 0 ? links : null;
  if (warnings.length === 0 && !provenance) return null;

  return (
    <div
      className="rounded-sm border border-line-2 bg-panel p-3 text-sm"
      data-testid="proposal-readiness-notice"
    >
      {provenance ? (
        <p className="text-ink-2">
          <span className="font-medium text-ink">Imported event · </span>
          {provenance
            .map(
              (link) =>
                `${SOURCE_LABEL[link.sourceSystem] ?? link.sourceSystem} ${link.externalId}`,
            )
            .join(", ")}
          <span className="text-ink-3">
            {" "}
            — check mapped fields against the source before sending.
          </span>
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-warn">
          {warnings.map((warning) => (
            <li key={warning} data-testid="proposal-readiness-warning">
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
