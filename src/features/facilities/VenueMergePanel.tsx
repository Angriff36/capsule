import { useMutation } from "convex/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Doc } from "../../lib/api";
import { useListVenue } from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { reportActionFail, reportActionOk } from "../../ui/action-result";
import { SearchSelect } from "../../ui/SearchSelect";

const place = (venue: Doc<"venues">) =>
  [venue.addressLine1, venue.city].filter(Boolean).join(", ") || null;

/**
 * Merge this venue into another one when they are the same place typed
 * twice. Its events, commission terms, holds, rooms and notes move to the
 * venue you keep; this one leaves the book (convex/venueMerge.ts).
 */
export function VenueMergePanel({ venue }: { venue: Doc<"venues"> }) {
  const venues = useListVenue();
  const merge = useMutation(api.venueMerge.mergeInto);
  const navigate = useNavigate();
  const { prompt, host } = useActionPrompt(false);
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);

  const others = (venues ?? []).filter(
    (row) => row.deletedAt == null && row._id !== venue._id,
  );
  // The same address first: those are the likely duplicates.
  const sameAddress = (row: Doc<"venues">) =>
    !!venue.addressLine1 &&
    row.addressLine1?.trim().toLowerCase() ===
      venue.addressLine1.trim().toLowerCase();
  const options = [...others]
    .sort((a, b) => Number(sameAddress(b)) - Number(sameAddress(a)))
    .map((row) => ({
      id: row._id as string,
      label: row.name,
      hint: [sameAddress(row) ? "Same address" : null, place(row)]
        .filter(Boolean)
        .join(" · "),
    }));
  const target = others.find((row) => row._id === targetId);

  const run = async () => {
    if (!target) return;
    const reason = await prompt.askReason({
      title: `Merge into ${target.name}`,
      description: `${venue.name}'s events, commission terms, holds, rooms and notes move to ${target.name}, and ${venue.name} leaves the venue list.`,
      label: "Why these are the same venue",
      confirmLabel: "Merge venues",
      tone: "danger",
    });
    if (!reason) return;
    setBusy(true);
    try {
      const result = await merge({
        duplicateVenueId: venue._id,
        targetVenueId: target._id,
        reason,
      });
      const events = result.moved.events ?? 0;
      reportActionOk(
        `Merged into ${result.keptName}. ${events} event${events === 1 ? "" : "s"} moved.`,
      );
      navigate(`/facilities/venues/${target._id}`);
    } catch (error) {
      reportActionFail(
        error instanceof Error
          ? error.message.replace(/^.*ConvexError: /, "").split("\n")[0]!
          : "Couldn't merge these venues.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-sm border border-line bg-panel p-6">
      {host}
      <h3 className="text-lg font-medium">Same place as another venue?</h3>
      <p className="mt-2 text-sm text-ink-2">
        Merge this venue into the one to keep. Its events, commission terms,
        date holds, rooms and notes move over.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <SearchSelect
            aria-label="Venue to keep"
            value={targetId}
            onChange={setTargetId}
            placeholder="Search for the venue to keep…"
            options={options}
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!target || busy}
          onClick={() => void run()}
        >
          {busy ? "Merging…" : target ? `Merge into ${target.name}` : "Merge"}
        </button>
      </div>
    </section>
  );
}
