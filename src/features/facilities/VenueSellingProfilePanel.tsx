import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Doc } from "../../lib/api";
import { useVenueSetSellingProfile } from "../../lib/manifest-convex-react";
import { Section } from "../../ui/primitives";
import {
  classifyCommandFailure,
  type CommandFailure,
} from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";
import { venueInfoPacketPath } from "./facilitiesRoutes";
import {
  VENUE_VIBES,
  VENUE_VIBE_GUIDE,
  sellingProfileLines,
  vibeGuide,
  type VenueVibe,
} from "./venueSellingProfile";

const FIELDS = [
  {
    name: "vibeWords",
    label: "The look in a few words",
    placeholder: "Rustic industrial warehouse",
  },
  {
    name: "topFeature",
    label: "What makes it special (the one thing guests remember)",
    placeholder: "The brick wall with the old factory windows",
  },
  {
    name: "otherFeatures",
    label: "Also worth showing",
    placeholder: "Rooftop patio, fireplace lounge",
  },
  {
    name: "targetClient",
    label: "Who books it",
    placeholder: "Young couples who want a city loft feel",
  },
  {
    name: "exclusiveItemIdea",
    label: "Only-here dish idea",
    placeholder: "Skyline ceviche bar",
  },
  {
    name: "competitivePosition",
    label: "Against other venues nearby",
    placeholder: "Only loft in town with a full kitchen",
  },
  {
    name: "photoFocus",
    label: "What to photograph here",
    placeholder: "Food against the brick wall",
  },
] as const;

const text = (data: FormData, name: string) =>
  String(data.get(name) ?? "").trim() || undefined;

/**
 * What makes this venue special (Venue Partner Playbook section 09): the
 * venue's look, its stand-out features, who books it and what to photograph,
 * with the food look and serve style that suit it.
 */
export function VenueSellingProfilePanel({ venue }: { venue: Doc<"venues"> }) {
  const setProfile = useVenueSetSellingProfile();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [vibe, setVibe] = useState(String(venue.vibe ?? ""));
  const lines = sellingProfileLines(venue);
  const guide = vibeGuide(vibe);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setFailure(null);
    setBusy(true);
    setProfile({
      docId: venue._id,
      version: venue.version,
      vibe: (vibe || undefined) as VenueVibe | undefined,
      ...Object.fromEntries(
        FIELDS.map((field) => [field.name, text(data, field.name)]),
      ),
    })
      .then(() => setEditing(false))
      .catch((error: unknown) => setFailure(classifyCommandFailure(error)))
      .finally(() => setBusy(false));
  };

  return (
    <Section title="What makes this venue special">
      <div className="space-y-3 p-4" data-testid="venue-selling-profile">
        {failure ? <FailureBanner failure={failure} /> : null}
        {editing ? (
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <label className="field-label sm:col-span-2">
              <span>Venue look</span>
              <select
                className="input"
                name="vibe"
                value={vibe}
                onChange={(event) => setVibe(event.target.value)}
              >
                <option value="">Not set</option>
                {VENUE_VIBES.map((value) => (
                  <option key={value} value={value}>
                    {VENUE_VIBE_GUIDE[value].label}
                  </option>
                ))}
              </select>
            </label>
            {guide ? (
              <p className="text-sm text-ink-3 sm:col-span-2">
                Food look: {guide.presentation}. Best serve style:{" "}
                {guide.serveStyle}.
              </p>
            ) : null}
            {FIELDS.map((field) => (
              <label key={field.name} className="field-label">
                <span>{field.label}</span>
                <input
                  className="input"
                  name={field.name}
                  defaultValue={String(venue[field.name] ?? "")}
                  placeholder={field.placeholder}
                />
              </label>
            ))}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  setVibe(String(venue.vibe ?? ""));
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            {lines.length === 0 ? (
              <p className="text-sm text-ink-3">
                Not written yet. Write down the look of this venue and what
                guests love about it; the event-day sheet then tells the crew
                how to present the food here.
              </p>
            ) : (
              <dl className="grid gap-2 text-sm">
                {lines.map((line) => (
                  <div
                    key={line.label}
                    className="grid grid-cols-1 gap-1 sm:grid-cols-3"
                  >
                    <dt className="text-ink-3">{line.label}</dt>
                    <dd className="whitespace-pre-line text-ink sm:col-span-2">
                      {line.text}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setVibe(String(venue.vibe ?? ""));
                setEditing(true);
              }}
            >
              {lines.length === 0 ? "Write the venue profile" : "Edit"}
            </button>{" "}
            <Link
              className="btn btn-secondary"
              to={venueInfoPacketPath(String(venue._id))}
            >
              Venue info packet
            </Link>
          </>
        )}
      </div>
    </Section>
  );
}
