import { useState, type FormEvent } from "react";
import {
  useCreateTimeOffRequest,
  useListTimeOffRequest,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";

const dateOnly = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function startOfLocalDate(value: FormDataEntryValue | null): number {
  return new Date(`${String(value)}T00:00:00`).getTime();
}

function endOfLocalDate(value: FormDataEntryValue | null): number {
  const date = new Date(`${String(value)}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

function requestRange(startsAt?: number | null, endsAt?: number | null) {
  if (startsAt == null || endsAt == null) return "Dates unavailable";
  return `${dateOnly.format(startsAt)} – ${dateOnly.format(endsAt - 1)}`;
}

export function TimeOffRequestCard({
  personId,
  busy,
  run,
}: {
  personId: string;
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => void;
}) {
  const requests = useListTimeOffRequest();
  const submitRequest = useCreateTimeOffRequest();
  const [showForm, setShowForm] = useState(false);

  const myRequests = (requests ?? [])
    .filter(
      (request) => request.deletedAt == null && request.personId === personId,
    )
    .sort((left, right) => (right.submittedAt ?? 0) - (left.submittedAt ?? 0));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const startsAt = startOfLocalDate(data.get("startsOn"));
    const endsAt = endOfLocalDate(data.get("endsOn"));
    const reason = String(data.get("reason") || "").trim();
    run("submit-time-off", async () => {
      await submitRequest({ personId, startsAt, endsAt, reason });
      form.reset();
      setShowForm(false);
    });
  };

  return (
    <section
      className="card overflow-hidden border-brand/20"
      data-testid="time-off-request-card"
    >
      <div className="border-b border-line-2 bg-brand-soft px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-brand">Time off</p>
            <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.02em]">
              Request days away
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
              Send the dates and a short reason. Your manager will review it
              here; approved dates cannot be assigned a shift.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm shrink-0 py-2"
            onClick={() => setShowForm((value) => !value)}
          >
            {showForm ? "Close" : "New request"}
          </button>
        </div>
      </div>

      {showForm ? (
        <form className="flex flex-col gap-3 px-4 py-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <label className="field-label">
              First day
              <input name="startsOn" className="input" type="date" required />
            </label>
            <label className="field-label">
              Last day
              <input name="endsOn" className="input" type="date" required />
            </label>
          </div>
          <label className="field-label">
            Reason
            <textarea
              name="reason"
              className="input min-h-24 resize-y py-2"
              placeholder="Family plans, appointment, travel…"
              required
            />
          </label>
          <button
            className="btn btn-primary w-full py-3 text-[15px]"
            disabled={busy != null}
          >
            {busy === "submit-time-off" ? "Sending…" : "Send request"}
          </button>
        </form>
      ) : null}

      <div className="px-4 py-3">
        {requests === undefined ? (
          <TableSkeleton rows={2} />
        ) : myRequests.length === 0 ? (
          <p className="text-[13px] text-ink-3">No time-off requests yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line-2">
            {myRequests.slice(0, 6).map((request) => (
              <li key={request._id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13.5px] font-semibold">
                    {requestRange(request.startsAt, request.endsAt)}
                  </p>
                  <StatusChip status={String(request.status)} />
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
                  {request.reason}
                </p>
                {request.responseNote ? (
                  <p className="mt-1.5 rounded-xs bg-inset px-2 py-1.5 text-[12px] text-ink-2">
                    Manager note: {request.responseNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
