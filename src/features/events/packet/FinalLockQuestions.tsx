import { useState } from "react";
import { Link } from "react-router-dom";
import type { Id } from "../../../lib/api";
import {
  lineText,
  type FinalLockReport,
} from "../../../lib/eventPacket/finalLock/evaluate";
import type {
  AnswerSource,
  FinalLockAnswer,
  FinalLockGroup,
  FinalLockOutcome,
  FinalLockResult,
} from "../../../lib/eventPacket/finalLock/types";
import {
  useFinalLock,
  type FinalLockOverrideInput,
} from "../../../lib/eventPacket/useFinalLock";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import { FailureBanner } from "../FailureBanner";
import { eventDetailPath, type EventDetailTab } from "../eventRoutes";
import { FieldFormsPanel } from "./FieldFormsPanel";
import { OutsideChannelForm } from "./OutsideChannelForm";
import { formatDateTime } from "../../../lib/format";

const OUTCOME: Record<FinalLockOutcome, string> = {
  clear: "ALL ANSWERED",
  needs_review: "NEEDS REVIEW",
  field_work_pending: "WAITING ON DAY-OF WORK",
  stale: "CHANGED SINCE PRINTING",
};

const RESULT: Record<FinalLockResult, string> = {
  answered: "Answered",
  not_applicable: "Not needed",
  unresolved: "Needs review",
  field_confirmation: "Done on the day",
};

const GROUP: Record<FinalLockGroup, string> = {
  identity: "Event and customer",
  menu: "Menu",
  timeline: "Day plan",
  setup: "Setup",
  servingware: "Servingware",
  rentals: "Rentals",
  room: "Room setup",
  food: "Food service",
  bussing: "Bussing",
  dessert: "Dessert",
  beverage: "Beverages",
  buffet: "Buffet",
  vehicles: "Trucks and equipment",
  communication: "Team chat",
  readiness: "Ready to go",
  field: "Day-of forms",
};

/** Where on the event a source record is shown, in plain words. */
const SOURCE: Record<string, { label: string; tab?: EventDetailTab }> = {
  events: { label: "Event details", tab: "overview" },
  eventDishes: { label: "Menu line", tab: "menu" },
  eventTimelineActivities: { label: "Timeline", tab: "timeline" },
  eventVehicleAssignments: { label: "Truck assignment", tab: "equipment" },
  equipmentReservations: { label: "Equipment reservation", tab: "equipment" },
  packLists: { label: "Pack list", tab: "equipment" },
  packListItems: { label: "Pack list line", tab: "equipment" },
  eventAssignments: { label: "Staff assignment", tab: "staffing" },
  eventStaffNeeds: { label: "Staff request", tab: "staffing" },
  staffMessages: { label: "Team chat", tab: "chat" },
  clients: { label: "Customer", tab: "client" },
  proposals: { label: "Accepted proposal", tab: "client" },
  proposalLineItems: { label: "Proposal line", tab: "client" },
  proposalDishSelections: { label: "Proposal dish", tab: "client" },
  proposalEnhancements: { label: "Proposal extra", tab: "client" },
  eventPacketResolutions: { label: "Recorded decision" },
  eventPacketRevisions: { label: "Printed workbook" },
  fieldConfirmations: { label: "Signed day-of form" },
};

function sourceLink(eventId: string, source: AnswerSource) {
  if (source.table === "dishes") return `/kitchen/dishes/${source.id}`;
  if (source.table === "venues") return `/facilities/venues/${source.id}`;
  const tab = SOURCE[source.table]?.tab;
  return tab ? eventDetailPath(eventId, tab) : null;
}

const sourceLabel = (source: AnswerSource) =>
  SOURCE[source.table]?.label ??
  (source.table === "dishes"
    ? "Dish"
    : source.table === "venues"
      ? "Venue"
      : source.table === "serviceStyles"
        ? "Service style"
        : source.table === "serviceStyleKitItems"
          ? "Service style kit"
          : "Equipment");

const when = (value: number | string | null) =>
  value == null ? null : formatDateTime(value);

/**
 * The event's Final Lock questions: each answer, why, where it came from,
 * who settles it, any manager decision, and when day-of forms are due.
 */
export function FinalLockPanel({ eventId }: { eventId: Id<"events"> }) {
  const { report, override } = useFinalLock(eventId);
  if (!report)
    return (
      <p className="mt-4 text-sm text-ink-3" role="status">
        Loading Final Lock answers…
      </p>
    );
  const chat = report.answers.find(
    (a) => a.questionKey === "communication.channel",
  );
  const suggested =
    chat?.value.type === "record" ? chat.value.fields.outsideChannelName : null;
  return (
    <>
      <FinalLockQuestionList
        eventId={eventId}
        report={report}
        onOverride={override}
      />
      <FieldFormsPanel eventId={eventId} />
      <OutsideChannelForm
        eventId={eventId}
        suggestedName={typeof suggested === "string" ? suggested : null}
      />
    </>
  );
}

export function FinalLockQuestionList({
  eventId,
  report,
  onOverride,
  defaultOpen = false,
}: {
  eventId: string;
  report: FinalLockReport;
  /** Absent when the viewer may not decide answers. */
  onOverride?: (input: FinalLockOverrideInput) => Promise<unknown>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const needsReview = report.answers.filter(
    (a) => a.result === "unresolved",
  ).length;
  const groups = Array.from(new Set(report.answers.map((a) => a.group)));
  return (
    <div className="mt-4" data-testid="final-lock-questions">
      <h4 className="section-rule">
        <span>Final Lock questions</span>
        <i aria-hidden="true" />
        <em>
          {OUTCOME[report.outcome]} · {needsReview} need review
        </em>
      </h4>
      {report.staleSections.length > 0 && (
        <p className="mt-2 text-sm text-danger" role="status">
          Answers changed after the workbook was printed. Print it again.
        </p>
      )}
      <button
        className="btn-link mt-2"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open
          ? "Hide questions"
          : `Show all ${report.answers.length} questions`}
      </button>
      {open &&
        groups.map((group) => (
          <section key={group} className="mt-4" aria-label={GROUP[group]}>
            <p className="text-sm font-semibold text-ink">{GROUP[group]}</p>
            <ul className="divide-y divide-line">
              {report.answers
                .filter((a) => a.group === group)
                .map((answer) => (
                  <QuestionRow
                    key={answer.questionKey}
                    eventId={eventId}
                    answer={answer}
                    changed={report.staleQuestions.includes(answer.questionKey)}
                    onOverride={onOverride}
                  />
                ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function QuestionRow({
  eventId,
  answer,
  changed,
  onOverride,
}: {
  eventId: string;
  answer: FinalLockAnswer;
  changed: boolean;
  onOverride?: (input: FinalLockOverrideInput) => Promise<unknown>;
}) {
  const field = answer.fieldWork;
  return (
    <li className="py-3 text-sm" data-question={answer.questionKey}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-ink">{answer.label}</span>
        <span
          className={
            answer.result === "unresolved" ? "text-danger" : "text-ink-2"
          }
        >
          {answer.override ? "Manager decision" : RESULT[answer.result]}
          {changed ? " · changed since printing" : ""}
        </span>
      </div>
      <p className="mt-1 text-ink">{lineText(answer)}</p>
      {/* A "Why" that only repeats the answer adds nothing to read. */}
      {!answer.override &&
        answer.result !== "unresolved" &&
        answer.explanation.trim() !== lineText(answer).trim() && (
          <p className="mt-1 text-ink-3">Why: {answer.explanation}</p>
        )}
      {answer.missing.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-ink-2">
          {answer.missing.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      )}
      {answer.override && (
        <p className="mt-1 text-ink-2">
          Decided {when(answer.override.at)}. Reason: {answer.override.reason}
        </p>
      )}
      <p className="mt-1 text-ink-3">Settled by: {answer.resolver}</p>
      {field && (
        <p className="mt-1 text-ink-2">
          {field.confirmedAt
            ? `Done by ${field.confirmedBy ?? "a staff member"}, ${when(field.confirmedAt)}`
            : `${field.dueAt ? `Due ${when(field.dueAt)}` : "Due on the day"}${
                field.status === "not_set_up"
                  ? " · not set up yet"
                  : field.status === "first_signed"
                    ? " · waiting for the second person"
                    : field.responsible
                      ? ` · ${field.responsible} is down to do it`
                      : ""
              }`}
        </p>
      )}
      {answer.sources.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-x-3 text-ink-3">
          From:
          {answer.sources.map((source, index) => {
            const to = sourceLink(eventId, source);
            const label = sourceLabel(source);
            // Two fields of the same record read as one source.
            const seen = answer.sources.findIndex(
              (other) =>
                sourceLabel(other) === label &&
                sourceLink(eventId, other) === to,
            );
            if (seen !== index) return null;
            return to ? (
              <Link key={index} className="btn-link" to={to}>
                {label}
              </Link>
            ) : (
              <span key={index}>{label}</span>
            );
          })}
        </p>
      )}
      {onOverride && !field && (
        <OverrideForm answer={answer} onOverride={onOverride} />
      )}
    </li>
  );
}

function OverrideForm({
  answer,
  onOverride,
}: {
  answer: FinalLockAnswer;
  onOverride: (input: FinalLockOverrideInput) => Promise<unknown>;
}) {
  const [value, setValue] = useState("");
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const billing = answer.questionKey === "identity.billing";
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-ink-2">
        {answer.override ? "Change the decision" : "Decide this for this event"}
      </summary>
      {failure && (
        <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
      )}
      <form
        className="mt-2 space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setFailure(null);
          try {
            await onOverride({
              questionKey: answer.questionKey,
              basedOn: answer.basis,
              answer: value,
              reason,
              ...(billing && price !== "" ? { price: Number(price) } : {}),
            });
            setValue("");
            setPrice("");
            setReason("");
          } catch (error) {
            setFailure(classifyCommandFailure(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block">
          {billing ? "Who pays" : "Answer"}
          <input
            className="input mt-1 block w-full"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {billing && (
          <label className="block">
            Price
            <input
              className="input mt-1 block w-full"
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
        )}
        <label className="block">
          Why this event is different
          <input
            className="input mt-1 block w-full"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button className="btn btn-secondary btn-sm" disabled={busy}>
          {busy ? "Saving…" : "Save decision"}
        </button>
      </form>
    </details>
  );
}
