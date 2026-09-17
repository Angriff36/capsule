import { useState, type FormEvent } from "react";
import type { Doc } from "../../lib/api";
import { toDatetimeLocalValue } from "../../lib/format";
import { useEventPlanEngagement } from "../../lib/manifest-convex-react";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";
import { clientDisplayName } from "./clientName";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";

/** Finishes the existing captured draft through the normal planning command. */
export function CompleteDraftPlanningPanel({
  event,
  clients,
}: {
  event: Doc<"events">;
  clients: Doc<"clients">[] | undefined;
}) {
  const planEngagement = useEventPlanEngagement();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const localTime = (value: number | null | undefined) =>
    value == null ? "" : toDatetimeLocalValue(value);
  const submit = async (submission: FormEvent<HTMLFormElement>) => {
    submission.preventDefault();
    const data = new FormData(submission.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    const number = (key: string) => {
      const value = text(key);
      if (!value || !Number.isFinite(Number(value)))
        throw new Error("Enter each required planning amount and guest count.");
      return Number(value);
    };
    const time = (key: "startsAt" | "endsAt") =>
      text(key) === localTime(event[key]) && event[key] != null
        ? event[key]
        : Date.parse(text(key));
    setBusy(true);
    setFailure(null);
    try {
      await planEngagement({
        docId: event._id,
        version: event.version,
        clientId: text("clientId"),
        title: text("title"),
        eventType: text("eventType"),
        startsAt: time("startsAt"),
        endsAt: time("endsAt"),
        expectedHeadcount: number("expectedHeadcount"),
        primaryContactName: text("primaryContactName"),
        budgetAmount: number("budgetAmount"),
        quotedPrice: number("quotedPrice"),
        // Generated updates clear omitted optional fields. Carry the current
        // native planning context forward, including edits made after import.
        serviceStyleId: event.serviceStyleId ?? undefined,
        occasionId: event.occasionId ?? undefined,
        venueId: event.venueId ?? undefined,
        venueName: event.venueName ?? undefined,
        venueAddress: event.venueAddress ?? undefined,
        venueCapacity: event.venueCapacity ?? undefined,
        primaryContactEmail: event.primaryContactEmail ?? undefined,
        primaryContactPhone: event.primaryContactPhone ?? undefined,
        accessibilityNeeds: event.accessibilityNeeds ?? [],
        serviceRequirements: event.serviceRequirements ?? undefined,
        operationalRequirements: event.operationalRequirements ?? undefined,
        assignedToId: event.assignedToId ?? undefined,
        referralSourceId: event.referralSourceId ?? undefined,
      });
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="complete-draft-planning"
      className="my-4 space-y-3 border-y border-line py-4"
    >
      <h2 id="complete-draft-planning" className="section-rule">
        <span>Complete event planning</span>
        <i aria-hidden="true" />
      </h2>
      <p className="text-ink-2">
        This imported draft is saved. Complete the planning facts below to
        enable submission for approval on this same event. You can continue
        working on the draft until these facts are known.
      </p>
      <form
        onSubmit={(submission) => void submit(submission)}
        className="space-y-3"
      >
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
          <label className="field-label">
            Client
            <select
              name="clientId"
              className="input"
              required
              defaultValue={event.clientId ?? ""}
              disabled={clients === undefined}
            >
              <option value="">Select client</option>
              {(clients ?? [])
                .filter(
                  (client) =>
                    client.deletedAt == null &&
                    (client.status === "active" ||
                      client._id === event.clientId),
                )
                .map((client) => (
                  <option key={client._id} value={client._id}>
                    {clientDisplayName(client._id, clients)}
                  </option>
                ))}
            </select>
          </label>
          <label className="field-label">
            Event title
            <input
              name="title"
              className="input"
              required
              defaultValue={event.title}
            />
          </label>
          <label className="field-label">
            Event type
            <input
              name="eventType"
              className="input"
              required
              defaultValue={event.eventType}
            />
          </label>
          <label className="field-label">
            Primary contact name
            <input
              name="primaryContactName"
              className="input"
              required
              defaultValue={event.primaryContactName ?? ""}
            />
          </label>
          <label className="field-label">
            Start
            <BoundedDateTimeLocalInput
              name="startsAt"
              className="input"
              required
              defaultValue={localTime(event.startsAt)}
            />
          </label>
          <label className="field-label">
            End
            <BoundedDateTimeLocalInput
              name="endsAt"
              className="input"
              required
              defaultValue={localTime(event.endsAt)}
            />
          </label>
          <label className="field-label">
            Guest count
            <input
              name="expectedHeadcount"
              className="input"
              type="number"
              min={1}
              max={100000}
              required
              defaultValue={event.expectedHeadcount ?? ""}
            />
          </label>
          <label className="field-label">
            Client budget
            <input
              name="budgetAmount"
              className="input"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={event.budgetAmount ?? ""}
            />
          </label>
          <label className="field-label">
            Quoted price
            <input
              name="quotedPrice"
              className="input"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={event.quotedPrice ?? ""}
            />
          </label>
        </fieldset>
        {failure ? (
          <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
        ) : null}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || clients === undefined}
        >
          {busy ? "Saving planning facts…" : "Complete planning"}
        </button>
      </form>
    </section>
  );
}
