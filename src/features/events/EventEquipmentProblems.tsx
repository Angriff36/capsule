import { useState, type FormEvent } from "react";
import {
  useEquipmentIssueRevise,
  useEquipmentIssueSettle,
} from "../../lib/manifest-convex-react";
import { formatMoneyExact } from "../../lib/format";
import { useEventEquipmentExceptions } from "../facilities/equipmentCheckout";
import { SupplyFailureBanner } from "../inventory/SupplyFailureBanner";

const KIND_LABEL: Record<string, string> = {
  damaged: "Broken",
  missing: "Missing",
  cleaning: "Needs cleaning",
  repair: "Repair",
  late_return: "Late back",
  vendor_return: "Short to rental company",
};

const PAYER_LABEL: Record<string, string> = {
  undecided: "Not decided yet",
  company: "We pay",
  client: "Bill the client",
  vendor: "Claim from the vendor",
};

const when = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

type Problem = {
  issueId: string;
  version: number;
  kind: string;
  description: string;
  quantity: number;
  holdsUnits: boolean;
  status: string;
  payer: string;
  cost: number | null;
  chargeAmount: number | null;
  resolution: string | null;
};

function money(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * PL-RETURNS (spec §13.3/§13.4): an event's equipment problems - broken,
 * missing, dirty, in repair, short to a vendor - with who pays and what, the
 * returns that came back late, and (for a cancelled event) what is still out
 * or still booked with a vendor. Shown on the event's equipment tab and on
 * the closeout so the bill and the closeout see the same list.
 */
export function EventEquipmentProblems({
  eventId,
  hideWhenEmpty = false,
}: {
  readonly eventId: string;
  /** Closeout: show nothing when the event had no equipment problems. */
  readonly hideWhenEmpty?: boolean;
}) {
  const data = useEventEquipmentExceptions(eventId);
  const revise = useEquipmentIssueRevise();
  const settle = useEquipmentIssueSettle();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  if (data == null) return null;
  const { problems, late, obligations, notHeld, totals } = data as {
    problems: Problem[];
    notHeld: Array<{
      equipmentId: string;
      name: string;
      approved: number;
      held: number;
    }>;
    late: Array<{
      recordId: string;
      name: string;
      quantity: number;
      dueAt: number;
      returnedAt: number | null;
      stillOut: boolean;
      fromVendor: boolean;
    }>;
    obligations: Array<{ code: string; recordId: string; label: string }>;
    totals: {
      open: number;
      payerUndecided: number;
      chargeClient: number;
      chargeVendor: number;
      companyCost: number;
    };
  };
  if (
    problems.length === 0 &&
    late.length === 0 &&
    obligations.length === 0 &&
    notHeld.length === 0
  )
    return hideWhenEmpty ? null : (
      <p className="text-sm text-ink-3" data-testid="equipment-problems-none">
        No equipment problems for this event.
      </p>
    );

  const apply = (
    problem: Problem,
    action: "save" | "settle",
    element: HTMLFormElement,
  ) => {
    const form = new FormData(element);
    const payer = String(form.get("payer") ?? "") || undefined;
    const chargeAmount = money(form.get("chargeAmount"));
    const cost = money(form.get("cost"));
    setBusy(true);
    setFailure(null);
    const work =
      action === "settle"
        ? settle({
            docId: problem.issueId,
            version: problem.version,
            resolution: String(form.get("resolution") ?? "").trim(),
            payer,
            chargeAmount,
            cost,
          })
        : revise({
            docId: problem.issueId,
            version: problem.version,
            payer,
            chargeAmount,
            cost,
          });
    void Promise.resolve(work)
      .then(() => setOpen(null))
      .catch(setFailure)
      .finally(() => setBusy(false));
  };

  return (
    <section
      className="card space-y-3 p-5"
      aria-labelledby={`equipment-problems-${eventId}`}
      data-testid="equipment-problems"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          id={`equipment-problems-${eventId}`}
          className="text-base font-semibold text-ink"
        >
          Equipment problems
        </h3>
        <p className="text-sm text-ink-2">
          Bill the client {formatMoneyExact(totals.chargeClient)} · Claim from
          vendors {formatMoneyExact(totals.chargeVendor)} · Our cost{" "}
          {formatMoneyExact(totals.companyCost)}
        </p>
      </div>
      {totals.payerUndecided > 0 ? (
        <p className="text-sm text-warn">
          {totals.payerUndecided === 1
            ? "1 problem still needs someone to say who pays."
            : `${totals.payerUndecided} problems still need someone to say who pays.`}
        </p>
      ) : null}
      {failure ? <SupplyFailureBanner error={failure} /> : null}

      {problems.length > 0 ? (
        <ul className="divide-y divide-line">
          {problems.map((problem) => (
            <li key={problem.issueId} className="space-y-2 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-ink">
                  <strong>{KIND_LABEL[problem.kind] ?? problem.kind}</strong> ·{" "}
                  {problem.description}
                  {problem.status === "open" && problem.holdsUnits
                    ? " · can't be booked until sorted out"
                    : ""}
                </span>
                <span className="text-sm text-ink-2">
                  {PAYER_LABEL[problem.payer] ?? problem.payer}
                  {problem.chargeAmount != null
                    ? ` · ${formatMoneyExact(problem.chargeAmount)}`
                    : ""}
                  {problem.cost != null
                    ? ` · our cost ${formatMoneyExact(problem.cost)}`
                    : ""}
                  {problem.status === "resolved"
                    ? ` · Sorted out: ${problem.resolution ?? ""}`
                    : ""}
                </span>
              </div>
              {problem.status === "open" ? (
                open === problem.issueId ? (
                  <form
                    className="grid gap-2 sm:grid-cols-4"
                    onSubmit={(formEvent: FormEvent<HTMLFormElement>) => {
                      formEvent.preventDefault();
                      apply(problem, "settle", formEvent.currentTarget);
                    }}
                  >
                    <label className="field-label">
                      Who pays
                      <select
                        name="payer"
                        className="input"
                        defaultValue={problem.payer}
                      >
                        {Object.entries(PAYER_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Charge
                      <input
                        name="chargeAmount"
                        type="number"
                        min={0}
                        step="0.01"
                        className="input"
                        defaultValue={problem.chargeAmount ?? ""}
                      />
                    </label>
                    <label className="field-label">
                      Our cost
                      <input
                        name="cost"
                        type="number"
                        min={0}
                        step="0.01"
                        className="input"
                        defaultValue={problem.cost ?? ""}
                      />
                    </label>
                    <label className="field-label">
                      How it was sorted out
                      <input
                        name="resolution"
                        className="input"
                        placeholder="Fixed, cleaned, found, billed…"
                      />
                    </label>
                    <div className="flex gap-2 sm:col-span-4">
                      <button className="btn btn-primary" disabled={busy}>
                        Sorted out
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={(clickEvent) => {
                          const form = clickEvent.currentTarget.form;
                          if (form) apply(problem, "save", form);
                        }}
                      >
                        Save, still open
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setOpen(null)}
                      >
                        Close
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setOpen(problem.issueId)}
                  >
                    Deal with it
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {notHeld.length > 0 ? (
        <div className="space-y-1" data-testid="equipment-not-held">
          <p className="text-sm font-semibold text-ink">
            Approved by the client but not held
          </p>
          <ul className="list-disc pl-5 text-sm text-ink-2">
            {notHeld.map((row) => (
              <li key={row.equipmentId}>
                {row.name} · {row.held} of {row.approved} held · not enough free
                for this event. Hold the rest on the equipment list, rent it
                from a vendor, or change the proposal.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {late.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink">Came back late</p>
          <ul className="list-disc pl-5 text-sm text-ink-2">
            {late.map((row) => (
              <li key={row.recordId}>
                {row.quantity} {row.name}
                {row.fromVendor ? " (rental company)" : ""} · due{" "}
                {when.format(row.dueAt)} ·{" "}
                {row.stillOut
                  ? "still not back"
                  : `back ${when.format(row.returnedAt ?? row.dueAt)}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {obligations.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink">
            Still to sort out after cancelling
          </p>
          <ul className="list-disc pl-5 text-sm text-ink-2">
            {obligations.map((row) => (
              <li key={`${row.code}:${row.recordId}`}>{row.label}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
