import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "convex/react";
import { api, type Doc } from "../../lib/api";
import { formatDate } from "../../lib/format";
import {
  useCreateReferralSource,
  useCreateVenueNote,
  useListLead,
  useListPerson,
  useListReferralSource,
  useListVenue,
  useReferralSourceLinkVenue,
  useVenueSetPartnership,
} from "../../lib/manifest-convex-react";
import { Section } from "../../ui/primitives";
import { SearchSelect } from "../../ui/SearchSelect";
import {
  classifyCommandFailure,
  type CommandFailure,
} from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";
import { useVenueScorecardEvents } from "./useLogisticsWindow";
import { VenueBrandForm } from "./VenueBrandForm";
import { VenueHandoffPanel } from "./VenueHandoffPanel";
import { VenueOnboardingPanel } from "./VenueOnboardingPanel";
import { VenueProblemsPanel } from "./VenueProblemsPanel";
import { VenueReferralsPanel } from "./VenueReferralsPanel";
import { topReferringVenue } from "./venueReferrals";
import { ownerProblem } from "./venueHandoff";
import {
  CONTACT_DAYS,
  GRADE_MEANING,
  PARTNER_TIERS,
  PARTNER_TIER_LABELS,
  partnerScorecard,
  type PartnerTier,
} from "./venuePartnership";

const money = (value: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const LAST_MONTH_LABELS: Record<string, string> = {
  client_feedback: "Client feedback",
  debrief: "Team debrief",
  incident: "Problem or damage",
};

const score = (value: FormDataEntryValue | null) =>
  value === null || value === "" ? undefined : Number(value);

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}

/**
 * Venue partner program on the venue page (Mangia Venue Partner Playbook):
 * tier, the one person who owns the relationship, ratings, check-ins and the
 * partner scorecard.
 */
export function VenuePartnershipPanel({ venue }: { venue: Doc<"venues"> }) {
  const setPartnership = useVenueSetPartnership();
  const postNote = useCreateVenueNote();
  const createSource = useCreateReferralSource();
  const linkVenue = useReferralSourceLinkVenue();
  const people = useListPerson();
  // This venue's notes and its events of the last two years only.
  const notes = useQuery(api.queries.listVenueNoteByVenueId, {
    venueId: venue._id,
  });
  const sources = useListReferralSource();
  const leads = useListLead();
  const venues = useListVenue();
  const events = useVenueScorecardEvents([String(venue._id)]);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [checkIn, setCheckIn] = useState("");

  const venueId = String(venue._id);
  const card = useMemo(
    () =>
      partnerScorecard({
        venue,
        events: events ?? [],
        notes: notes ?? [],
        referralSources: sources ?? [],
        leads: leads ?? [],
        now: Date.now(),
      }),
    [venue, events, notes, sources, leads],
  );
  const staff = (people ?? []).filter((person) => person.deletedAt == null);
  const owner = staff.find(
    (person) => String(person._id) === String(venue.partnerOwnerPersonId),
  );
  const linkedSource = (sources ?? []).find(
    (source) =>
      source.deletedAt == null && String(source.venueId ?? "") === venueId,
  );
  const topVenueId = useMemo(
    () =>
      topReferringVenue({
        venueIds: (venues ?? [])
          .filter((row) => row.deletedAt == null && row.partnerTier)
          .map((row) => String(row._id)),
        sources: sources ?? [],
        leads: leads ?? [],
        now: Date.now(),
      }),
    [venues, sources, leads],
  );
  const tier = venue.partnerTier as PartnerTier | null | undefined;
  const ownerWarning = ownerProblem({
    isPartner: tier != null,
    ownerId: venue.partnerOwnerPersonId,
    activeStaffIds: new Set(staff.map((person) => String(person._id))),
    staffLoaded: people !== undefined,
  });
  const warnings = ownerWarning
    ? [ownerWarning, ...card.warnings]
    : card.warnings;

  const run = async (key: string, work: () => Promise<unknown>) => {
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

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run("save", () =>
      setPartnership({
        docId: venue._id,
        version: venue.version,
        partnerTier: (String(data.get("partnerTier") ?? "") || undefined) as
          PartnerTier | undefined,
        partnerOwnerPersonId:
          String(data.get("partnerOwnerPersonId") ?? "") || undefined,
        opsEaseScore: score(data.get("opsEaseScore")),
        relationshipScore: score(data.get("relationshipScore")),
      }),
    );
  };

  const trackLeads = () =>
    void run("source", async () => {
      // A source made earlier for this venue is reused, never made twice.
      const code = `venue-${venueId}`;
      const existing = (sources ?? []).find(
        (source) => source.deletedAt == null && source.code === code,
      );
      const id =
        existing?._id ??
        (
          (await createSource({
            name: `${venue.name} (venue referral)`,
            code,
            description: `Leads sent by the partner venue ${venue.name}.`,
          })) as { docId: string }
        ).docId;
      await linkVenue({
        docId: id,
        version: existing?.version ?? 1,
        venueId,
      });
    });

  return (
    <Section title="Venue partner">
      <div className="space-y-4 p-4">
        <p className="text-sm text-ink-3">
          A partner venue has one owner at your company who keeps in touch at
          least every {CONTACT_DAYS} days.
        </p>
        {failure ? <FailureBanner failure={failure} /> : null}

        <form
          key={`${venue.version}`}
          onSubmit={save}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className="field-label">
            <span>Partnership</span>
            <select
              className="input"
              name="partnerTier"
              defaultValue={tier ?? ""}
            >
              <option value="">Not a partner</option>
              {PARTNER_TIERS.map((value) => (
                <option key={value} value={value}>
                  {PARTNER_TIER_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          {/* Once there is an owner, a new one comes through the hand-over. */}
          {venue.partnerOwnerPersonId ? (
            <input
              type="hidden"
              name="partnerOwnerPersonId"
              value={String(venue.partnerOwnerPersonId)}
            />
          ) : (
            <label className="field-label">
              <span>Relationship owner</span>
              <SearchSelect
                name="partnerOwnerPersonId"
                recentsKey="staff"
                placeholder="Search staff…"
                defaultValue=""
                options={[
                  { id: "", label: "No owner yet" },
                  ...staff.map((person) => ({
                    id: person._id,
                    label: [person.givenName, person.familyName]
                      .filter(Boolean)
                      .join(" "),
                  })),
                ]}
              />
            </label>
          )}
          <label className="field-label">
            <span>Ease of work (1-10)</span>
            <input
              className="input"
              type="number"
              name="opsEaseScore"
              min={1}
              max={10}
              defaultValue={venue.opsEaseScore ?? ""}
            />
          </label>
          <label className="field-label">
            <span>Relationship health (1-10)</span>
            <input
              className="input"
              type="number"
              name="relationshipScore"
              min={1}
              max={10}
              defaultValue={venue.relationshipScore ?? ""}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy != null}
            >
              {busy === "save" ? "Saving…" : "Save partner details"}
            </button>
          </div>
        </form>

        {tier ? (
          <>
            <dl className="grid content-start gap-3 rounded-sm border border-line bg-inset p-4 text-sm sm:grid-cols-2 sm:gap-x-8">
              <Metric
                label="Partner since"
                value={
                  venue.partnerSince ? formatDate(venue.partnerSince) : "—"
                }
              />
              <Metric
                label="Owner"
                value={
                  owner
                    ? [owner.givenName, owner.familyName]
                        .filter(Boolean)
                        .join(" ")
                    : "No owner yet"
                }
              />
              <Metric
                label="Last check-in"
                value={
                  card.lastContactAt == null
                    ? "Never"
                    : `${formatDate(card.lastContactAt)} (${card.daysSinceContact} days ago)`
                }
              />
              <Metric
                label="Events, last 12 months"
                value={String(card.eventsLastYear)}
              />
              <Metric
                label="Booked value, last 12 months"
                value={money(card.revenueLastYear)}
              />
              <Metric
                label="Average per event"
                value={money(card.averagePerEvent)}
              />
              <Metric
                label="Leads sent to us"
                value={
                  linkedSource
                    ? `${card.referralsSent} (${card.referralsBooked} booked)`
                    : "Not tracked"
                }
              />
              <Metric
                label="Problems, last 90 days"
                value={String(card.problemsLast90Days)}
              />
              <Metric
                label="Client satisfaction"
                value={
                  card.clientSatisfaction == null
                    ? "No client scores yet"
                    : `${card.clientSatisfaction} / 10`
                }
              />
              <Metric
                label="Grade"
                value={
                  card.grade
                    ? `${card.grade} · ${GRADE_MEANING[card.grade]}`
                    : "Rate ease of work and relationship"
                }
              />
            </dl>
            {warnings.length > 0 ? (
              <ul className="space-y-1 rounded-sm border border-warn/40 bg-warn-soft p-3 text-sm text-ink">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}

            <VenueOnboardingPanel
              venue={venue}
              notes={notes ?? []}
              events={events ?? []}
              run={run}
              busy={busy}
            />

            <VenueHandoffPanel
              venue={venue}
              staff={staff}
              notes={notes ?? []}
              events={events ?? []}
              run={run}
              busy={busy}
            />

            <VenueProblemsPanel
              venue={venue}
              notes={notes ?? []}
              run={run}
              busy={busy}
            />

            <div className="space-y-2" data-testid="venue-partner-last-month">
              <h3 className="text-sm font-semibold text-ink">
                For the monthly check-in: last 30 days
              </h3>
              <p className="text-sm text-ink-3">
                {card.eventsLast30Days} event
                {card.eventsLast30Days === 1 ? "" : "s"} here.{" "}
                {card.lastMonth.length === 0
                  ? "No client feedback, debriefs or problems logged."
                  : null}
              </p>
              {card.lastMonth.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {card.lastMonth.map((note, index) => (
                    <li
                      key={`${note.postedAt}-${index}`}
                      className="rounded-sm border border-line p-2"
                    >
                      <span className="font-semibold text-ink">
                        {LAST_MONTH_LABELS[note.category] ?? note.category}
                      </span>
                      <span className="text-ink-3">
                        {` · ${formatDate(Number(note.postedAt))}`}
                      </span>
                      <p className="whitespace-pre-line text-ink-2">
                        {note.content}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!checkIn.trim()) return;
                void run("checkin", async () => {
                  await postNote({
                    venueId: venue._id,
                    category: "check_in",
                    content: checkIn.trim(),
                    visibility: "internal",
                  });
                  setCheckIn("");
                });
              }}
            >
              <label className="field-label">
                <span>Log a check-in (call, text or visit)</span>
                <textarea
                  className="input min-h-[3rem] py-2"
                  name="checkIn"
                  value={checkIn}
                  onChange={(event) => setCheckIn(event.target.value)}
                  placeholder="Called Sarah: two weddings booked for June, asked about a late-night snack menu."
                />
              </label>
              <button
                className="btn btn-secondary"
                type="submit"
                disabled={busy != null || !checkIn.trim()}
              >
                {busy === "checkin" ? "Saving…" : "Save check-in"}
              </button>
            </form>

            <VenueBrandForm venue={venue} run={run} busy={busy} />

            {linkedSource ? (
              <>
                <VenueReferralsPanel
                  venueId={venueId}
                  sources={sources ?? []}
                  leads={leads ?? []}
                  isTopVenue={topVenueId === venueId}
                />
                <p className="text-sm text-ink-3">
                  Leads from this venue: pick the lead source “
                  {linkedSource.name}” on the lead.
                </p>
              </>
            ) : (
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy != null}
                onClick={trackLeads}
              >
                {busy === "source"
                  ? "Setting up…"
                  : "Track leads this venue sends us"}
              </button>
            )}
          </>
        ) : null}
      </div>
    </Section>
  );
}
