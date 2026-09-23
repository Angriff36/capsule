import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CapsuleEventBundleCatalogMatch } from "../../../agent/CapsuleEventBundleExistingState";
import {
  useListClient,
  useListDish,
  useListVenue,
} from "../../../lib/manifest-convex-react";
import {
  loadEventBundleFromText,
  type TextReportSource,
} from "../../../lib/tppReports/loadEventBundleFromText";
import { ArrowLeftIcon } from "../../../ui/icons";
import { PageHeader } from "../../../ui/primitives";
import { clientDisplayName } from "../clientName";
import { eventDetailPath, eventsIndexPath } from "../eventRoutes";
import { FailureBanner } from "../FailureBanner";
import { venueSummary } from "../venuePickerSummary";
import { suggestCatalogMatches } from "./eventBundleCatalogMatch";
import { EventImportMatchCard } from "./EventImportMatchCard";
import { EventImportPreviewPanel } from "./EventImportPreviewPanel";
import { EventImportSourcesPanel } from "./EventImportSourcesPanel";
import { EventImportWarnings } from "./EventImportWarnings";
import { useEventImportDirectory } from "./useEventImportDirectory";
import { useEventImportRunner } from "./useEventImportRunner";

/**
 * Build an event from its BEO / worksheet instead of hand-typing ~80 fields
 * across six tabs (#368 item 1). Paste the report text (and drop any TPP CSV
 * exports), check what was read, confirm which existing records to reuse,
 * and one click creates the event with its menu lines and notes, timeline,
 * open shifts, pack list and review flags — the same governed commands the
 * tabs use, through the same plan the agent runs.
 */
export function EventImportPage() {
  const navigate = useNavigate();
  const clients = useListClient();
  const venues = useListVenue();
  const dishes = useListDish();
  const directory = useEventImportDirectory();

  const [pastedText, setPastedText] = useState("");
  const [csvFiles, setCsvFiles] = useState<TextReportSource[]>([]);
  const [match, setMatch] = useState<CapsuleEventBundleCatalogMatch>({});
  const [matchSeed, setMatchSeed] = useState<string | null>(null);

  const loaded = useMemo(() => {
    if (pastedText.trim().length === 0 && csvFiles.length === 0) return null;
    return loadEventBundleFromText({ pastedText, csvFiles });
  }, [pastedText, csvFiles]);
  const bundle = loaded?.bundle ?? null;

  const activeClients = useMemo(
    () =>
      (clients ?? []).filter(
        (client) => client.deletedAt == null && client.status === "active",
      ),
    [clients],
  );
  const activeVenues = useMemo(
    () =>
      (venues ?? []).filter(
        (venue) => venue.deletedAt == null && venue.status === "active",
      ),
    [venues],
  );
  const activeDishes = useMemo(
    () => (dishes ?? []).filter((dish) => dish.deletedAt == null),
    [dishes],
  );
  // Suggest matches once per distinct bundle identity; the person's picks
  // then stick while they keep editing the paste.
  const suggestion = useMemo(() => {
    if (!bundle) return null;
    return suggestCatalogMatches(bundle, {
      clients: activeClients.map((client) => ({
        id: client._id,
        name: clientDisplayName(client._id, activeClients),
        aliases: [client.email ?? ""].filter(Boolean),
      })),
      venues: activeVenues.map((venue) => ({
        id: venue._id,
        name: venue.name,
      })),
      dishes: activeDishes.map((dish) => ({ id: dish._id, name: dish.name })),
    });
  }, [bundle, activeClients, activeVenues, activeDishes]);
  const seedKey = suggestion
    ? JSON.stringify([
        suggestion.clientId,
        suggestion.venueId,
        suggestion.dishIds,
      ])
    : null;
  useEffect(() => {
    if (!suggestion || seedKey === matchSeed) return;
    setMatch({
      clientId: suggestion.clientId,
      venueId: suggestion.venueId,
      dishIds: suggestion.dishIds,
    });
    setMatchSeed(seedKey);
  }, [suggestion, seedKey, matchSeed]);

  const runner = useEventImportRunner({
    bundle,
    catalog: match,
    directory,
    pastedText,
  });
  const busy = runner.progress !== null;

  useEffect(() => {
    if (runner.result) {
      navigate(eventDetailPath(runner.result.eventId));
    }
  }, [runner.result, navigate]);

  const canCreate =
    bundle !== null &&
    runner.plan !== null &&
    runner.plan.steps.length > 0 &&
    !busy;

  return (
    <div className="space-y-4" data-testid="event-import-page">
      <Link
        to={eventsIndexPath()}
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink"
      >
        <ArrowLeftIcon width={12} height={12} /> All events
      </Link>
      <PageHeader
        title="Import an event from its BEO"
        lead="Paste the banquet event order or worksheet text, check what was read, and create the event with its menu, timeline, open shifts and pack list in one step."
      />

      {runner.failure ? (
        <FailureBanner
          failure={runner.failure}
          onDismiss={runner.dismissFailure}
        />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <EventImportSourcesPanel
          pastedText={pastedText}
          onPastedTextChange={setPastedText}
          csvFiles={csvFiles}
          onCsvFilesChange={setCsvFiles}
          disabled={busy}
        />

        <div className="space-y-3">
          {bundle && loaded ? (
            <>
              <EventImportPreviewPanel
                bundle={bundle}
                plan={runner.plan}
                recognized={loaded.recognized}
              />
              <EventImportWarnings
                warnings={runner.plan?.warnings ?? bundle.warnings}
                decisions={runner.decisions}
              />
              <EventImportMatchCard
                bundle={bundle}
                match={match}
                onMatchChange={setMatch}
                disabled={busy}
                clientOptions={activeClients.map((client) => ({
                  id: client._id,
                  label: clientDisplayName(client._id, activeClients),
                  hint:
                    [client.email, client.phone].filter(Boolean).join(" · ") ||
                    null,
                }))}
                venueOptions={activeVenues.map((venue) => ({
                  id: venue._id,
                  label: venue.name,
                  hint: venueSummary(venue),
                }))}
                dishOptions={activeDishes.map((dish) => ({
                  id: dish._id,
                  label: dish.name,
                  hint: dish.course ?? null,
                }))}
              />
            </>
          ) : (
            <section className="card p-4 text-sm text-ink-3">
              Nothing to review yet. Paste the report text on the left — the
              preview updates as you type.
            </section>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canCreate}
              onClick={() => void runner.run()}
              data-testid="event-import-create"
            >
              {busy
                ? `Creating… ${runner.progress?.completed ?? 0} of ${runner.progress?.total ?? 0}`
                : runner.plan
                  ? "Create event"
                  : bundle && !directory
                    ? "Checking existing records…"
                    : "Create event"}
            </button>
            {runner.progress ? (
              <span className="text-sm text-ink-2" role="status">
                {runner.progress.label}
              </span>
            ) : runner.failure ? (
              <span className="text-sm text-ink-3">
                Steps that finished are kept. Fix the cause and click Create
                again — it continues where it stopped.
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
