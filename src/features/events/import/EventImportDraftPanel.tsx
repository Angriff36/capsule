import { useState } from "react";
import { Link } from "react-router-dom";
import type { Id } from "../../../lib/api";
import {
  parseEventImportDraft,
  type EventImportSource,
} from "../../../lib/eventImportDraft";
import { useStorageUrls } from "../../../lib/fileStorageClient";
import { useGetEvent } from "../../../lib/manifest-convex-react";
import { useEventImportRetry } from "../../../lib/useEventImportRetry";
import { eventSourceEvidenceKey } from "../eventSourceEvidenceLink";
import { eventDetailPath } from "../eventRoutes";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import { FailureBanner } from "../FailureBanner";

const factLabels: Record<string, string> = {
  title: "Event title",
  invoiceNumber: "Invoice number",
  eventType: "Event type",
  eventDate: "Event date",
  startsAt: "Start time",
  endsAt: "End time",
  expectedHeadcount: "Guest count",
  clientName: "Client",
  primaryContactName: "Contact name",
  primaryContactEmail: "Contact email",
  primaryContactPhone: "Contact phone",
  venueName: "Venue",
  venueAddress: "Venue address",
  budgetAmount: "Budget",
  quotedPrice: "Quoted price",
  serviceRequirements: "Service instructions",
  operationalRequirements: "Operational instructions",
  staffing: "Staffing",
  equipment: "Equipment",
  timeline: "Timeline",
  otherNotes: "Other notes",
  discrepancies: "Source discrepancies",
};

function SourceFiles({ sources }: { sources: EventImportSource[] }) {
  const urls = useStorageUrls(sources.map((source) => source.storageId));
  return (
    <ul className="mt-1 space-y-1 break-words text-ink-2">
      {sources.map((source, index) => (
        <li key={`${source.storageId}-${index}`}>
          {urls?.[source.storageId] ? (
            <a
              className="text-link underline"
              href={urls[source.storageId]!}
              target="_blank"
              rel="noopener noreferrer"
            >
              {source.name}
            </a>
          ) : (
            source.name
          )}
        </li>
      ))}
    </ul>
  );
}

/** Retained source evidence, separate from the event's current operational plan. */
export function EventImportDraftPanel({ eventId }: { eventId: Id<"events"> }) {
  const retryImport = useEventImportRetry(eventId);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [notice, setNotice] = useState("");
  const event = useGetEvent(eventId);
  if (event === undefined) {
    return <p role="status">Loading imported BEO draft…</p>;
  }
  if (!event?.importDraftJson) return null;
  const draft = parseEventImportDraft(event.importDraftJson);
  if (!draft) {
    return (
      <p role="alert" className="text-danger">
        The saved BEO draft could not be read. Its imported details are
        unavailable.
      </p>
    );
  }
  const unresolved = draft.menu.filter((line) => line.status === "unresolved");
  const retryMatches = async () => {
    setBusy(true);
    setFailure(null);
    setNotice("");
    try {
      const result = await retryImport(draft);
      if (typeof result.error === "string") throw new Error(result.error);
      setNotice(
        "Matching finished. Review the saved import notes and event menu.",
      );
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(false);
    }
  };
  const sourceKey = eventSourceEvidenceKey({
    storedKey: event.importSourceKey,
    liveFileName: draft.sources[0]?.name,
  });
  const facts = Object.entries(draft.facts).filter(
    ([key, value]) =>
      key !== "menu" &&
      value != null &&
      value !== "" &&
      (!Array.isArray(value) || value.length > 0),
  );

  return (
    <section
      aria-labelledby="event-import-draft-heading"
      className="min-w-0 space-y-4"
    >
      <h2 id="event-import-draft-heading" className="section-rule">
        <span>Imported BEO draft</span>
        <i aria-hidden="true" />
      </h2>
      <p className="text-ink-2">
        Saved source details for review. These reflect the import, not later
        edits to the event or confirmation that the event is ready.
      </p>
      {sourceKey ? (
        <p data-testid="event-source-evidence-key">Source link: {sourceKey}</p>
      ) : null}
      {draft.status === "matching" || draft.status === "saved" ? (
        <p role="status">
          Menu matching is pending. Imported details are retained below.
        </p>
      ) : null}
      <div className="space-y-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void retryMatches()}
        >
          {busy ? "Matching…" : "Retry matches"}
        </button>
        <p className="text-ink-2">
          Retry catalog matches using the saved source details. Previously
          matched lines are skipped; the event menu shows current dishes.
        </p>
        {notice ? <p role="status">{notice}</p> : null}
        {failure ? (
          <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
        ) : null}
      </div>
      <div>
        <h3 className="font-semibold">Source files</h3>
        {draft.sources.length > 0 ? (
          <SourceFiles sources={draft.sources} />
        ) : (
          <p className="text-ink-2">No source files recorded.</p>
        )}
      </div>
      {draft.missing.length > 0 ? (
        <div>
          <h3 className="font-semibold">Not recorded in the source</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
            {draft.missing.map((key, index) => (
              <li key={`${key}-${index}`}>{factLabels[key] ?? key}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {draft.issues.length > 0 ? (
        <div>
          <h3 className="font-semibold">Import notes to review</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
            {draft.issues.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {unresolved.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-semibold">
            Unresolved menu lines ({unresolved.length})
          </h3>
          <p className="text-ink-2">
            These source lines have not been linked to event dishes.
          </p>
          <ol className="divide-y divide-line">
            {unresolved.map((line, index) => (
              <li key={index} className="space-y-1 py-3 break-words">
                <p className="font-semibold">{line.name}</p>
                <dl className="flex flex-wrap gap-x-6 gap-y-1 text-ink-2">
                  <div>
                    <dt className="inline font-medium">Quantity: </dt>
                    <dd className="inline">
                      {line.quantity ?? "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Unit: </dt>
                    <dd className="inline">{line.unit || "Not recorded"}</dd>
                  </div>
                  {line.course ? (
                    <div>
                      <dt className="inline font-medium">Course: </dt>
                      <dd className="inline">{line.course}</dd>
                    </div>
                  ) : null}
                </dl>
                {line.instructions ? (
                  <p className="whitespace-pre-wrap text-ink-2">
                    {line.instructions}
                  </p>
                ) : null}
                <p className="text-ink-2">
                  {line.reason || "Catalog match still needs review."}
                </p>
              </li>
            ))}
          </ol>
          <Link
            className="text-link inline-flex min-h-10 items-center"
            to={eventDetailPath(eventId, "menu")}
          >
            Open event menu
          </Link>
        </div>
      ) : null}
      {facts.length > 0 ? (
        <details className="border-t border-line pt-3">
          <summary className="cursor-pointer py-2 font-semibold">
            Extracted source facts
          </summary>
          <dl className="divide-y divide-line">
            {facts.map(([key, value]) => (
              <div key={key} className="py-2 break-words">
                <dt className="font-medium">{factLabels[key] ?? key}</dt>
                <dd className="whitespace-pre-wrap text-ink-2">
                  {Array.isArray(value) ? value.join("\n") : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </section>
  );
}
