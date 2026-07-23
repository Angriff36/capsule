import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useCreatePayrollInput,
  useListEvent,
  useListEventAssignment,
  useListPerson,
  useListShift,
} from "../../lib/manifest-convex-react";
import { formatDate } from "../../lib/format";
import { TableSkeleton } from "../../ui/primitives";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { FINANCE_ROUTES } from "./financeRoutes";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";
import {
  distributeTipPool,
  formatTipPayrollNote,
  moneyToCents,
  tipPayrollIdempotencyKey,
  type TipParticipant,
  type TipPoolingMethod,
} from "./tipDistribution";
import "./TipDistributionPage.css";

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
});

const roleLabel = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const personName = (person: {
  givenName?: string | null;
  familyName?: string | null;
}) =>
  `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim() ||
  "Unnamed staff member";

const durationHours = (start: unknown, end: unknown) => {
  const startAt = Number(start);
  const endAt = Number(end);
  return Number.isFinite(startAt) && Number.isFinite(endAt) && endAt > startAt
    ? Math.round(((endAt - startAt) / 3_600_000) * 100) / 100
    : 0;
};

export function TipDistributionPage() {
  const events = useListEvent();
  const assignments = useListEventAssignment();
  const people = useListPerson();
  const shifts = useListShift();
  const createPayrollInput = useCreatePayrollInput();
  const [eventId, setEventId] = useState("");
  const [total, setTotal] = useState("0.00");
  const [method, setMethod] = useState<TipPoolingMethod>("equal");
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [hoursByPerson, setHoursByPerson] = useState<Record<string, number>>(
    {},
  );
  const [weightsByRole, setWeightsByRole] = useState<Record<string, number>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeEvents = useMemo(
    () =>
      (events ?? [])
        .filter(
          (event) => event.deletedAt == null && event.stage !== "cancelled",
        )
        .sort(
          (left, right) =>
            Number(right.startsAt ?? 0) - Number(left.startsAt ?? 0),
        ),
    [events],
  );
  const selectedEvent = activeEvents.find((event) => event._id === eventId);

  const staff = useMemo(() => {
    const peopleById = new Map(
      (people ?? []).map((person) => [person._id, person]),
    );
    return (assignments ?? [])
      .filter(
        (assignment) =>
          assignment.eventId === eventId &&
          assignment.deletedAt == null &&
          !["unassigned", "no_show"].includes(String(assignment.status)),
      )
      .map((assignment) => {
        const person = peopleById.get(assignment.personId);
        if (!person || person.deletedAt != null || person.status !== "active") {
          return null;
        }
        const personShifts = (shifts ?? []).filter(
          (shift) =>
            shift.eventId === eventId &&
            shift.personId === assignment.personId &&
            shift.deletedAt == null &&
            !["cancelled", "no_show"].includes(String(shift.status)),
        );
        const scheduledHours = personShifts.reduce(
          (sum, shift) => sum + durationHours(shift.startsAt, shift.endsAt),
          0,
        );
        const assignmentHours = durationHours(
          assignment.startsAt,
          assignment.endsAt,
        );
        return {
          assignment,
          person,
          shiftId: personShifts.length === 1 ? personShifts[0]!._id : undefined,
          suggestedHours: scheduledHours || assignmentHours,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .filter(
        (row, index, rows) =>
          rows.findIndex(
            (candidate) => candidate.person._id === row.person._id,
          ) === index,
      )
      .sort((left, right) =>
        personName(left.person).localeCompare(personName(right.person)),
      );
  }, [assignments, eventId, people, shifts]);

  const roles = useMemo(
    () => [
      ...new Set(staff.map((row) => String(row.assignment.role || "staff"))),
    ],
    [staff],
  );

  const participants = useMemo<TipParticipant[]>(
    () =>
      staff
        .filter((row) => !excluded[row.person._id])
        .map((row) => {
          const role = String(row.assignment.role || "staff");
          return {
            personId: row.person._id,
            name: personName(row.person),
            role,
            hours: hoursByPerson[row.person._id] ?? row.suggestedHours,
            roleWeight: weightsByRole[role] ?? 1,
          };
        }),
    [excluded, hoursByPerson, staff, weightsByRole],
  );

  const calculation = useMemo(() => {
    try {
      const totalCents = moneyToCents(total);
      return {
        totalCents,
        shares: distributeTipPool(totalCents, participants, method),
        error: null,
      };
    } catch (error) {
      return {
        totalCents: 0,
        shares: [],
        error:
          error instanceof Error ? error.message : "Unable to calculate tips.",
      };
    }
  }, [method, participants, total]);

  const sendToPayroll = async () => {
    if (
      !selectedEvent ||
      calculation.error ||
      calculation.shares.length === 0
    ) {
      return;
    }
    setFailure(null);
    setNotice(null);
    setBusy(true);
    const periodStart = Number(selectedEvent.startsAt ?? Date.now());
    const periodEnd = Math.max(
      periodStart,
      Number(selectedEvent.endsAt ?? selectedEvent.startsAt ?? Date.now()),
    );
    try {
      for (const share of calculation.shares) {
        const staffRow = staff.find((row) => row.person._id === share.personId);
        await createPayrollInput({
          personId: share.personId,
          periodStart,
          periodEnd,
          regularMinutes: 0,
          overtimeMinutes: 0,
          totalMinutes: 0,
          eventId: selectedEvent._id,
          shiftId: staffRow?.shiftId,
          notes: formatTipPayrollNote({
            amountCents: share.shareCents,
            eventId: selectedEvent._id,
            eventTitle: selectedEvent.title || "Untitled event",
            method,
            version: 1,
          }),
          idempotencyKey: tipPayrollIdempotencyKey({
            eventId: selectedEvent._id,
            method,
            personId: share.personId,
            shareCents: share.shareCents,
            totalCents: calculation.totalCents,
          }),
        });
      }
      setNotice(
        `${calculation.shares.length} prepared payroll input${calculation.shares.length === 1 ? "" : "s"} created. Review and finalize them in Payroll.`,
      );
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  const loading =
    events === undefined ||
    assignments === undefined ||
    people === undefined ||
    shifts === undefined;

  return (
    <div className="tip-stage">
      <style>{`@media print { body * { visibility: hidden; } .tip-print-sheet, .tip-print-sheet * { visibility: visible; } .tip-print-sheet { position: absolute; inset: 0; width: 100%; } .tip-no-print { display: none !important; } }`}</style>
      <header className="tip-masthead tip-no-print">
        <div>
          <p className="eyebrow">Finance · Event settlement</p>
          <h1>Gratuity ledger</h1>
          <p>
            Turn one event tip pool into exact staff shares, then prepare those
            amounts for payroll review.
          </p>
        </div>
        <div className="tip-total-card" aria-live="polite">
          <span>Pool on the table</span>
          <strong>{money.format(calculation.totalCents / 100)}</strong>
          <small>{calculation.shares.length} staff included</small>
        </div>
      </header>

      <div className="tip-no-print">
        <FinanceWorkspaceNav />
      </div>

      {failure ? <FinanceFailureBanner error={failure} /> : null}
      {notice ? (
        <div className="tip-notice tip-no-print" role="status">
          <span>{notice}</span>
          <Link className="text-link" to={FINANCE_ROUTES.payroll}>
            Open payroll
          </Link>
        </div>
      ) : null}

      <section
        className="tip-controls tip-no-print"
        aria-label="Gratuity setup"
      >
        <label className="field-label tip-event-field">
          Event
          <select
            className="input"
            aria-label="Event"
            value={eventId}
            onChange={(event) => {
              setEventId(event.target.value);
              setExcluded({});
              setHoursByPerson({});
              setNotice(null);
            }}
          >
            <option value="">Choose an event</option>
            {activeEvents.map((event) => (
              <option key={event._id} value={event._id}>
                {event.title || "Untitled event"}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Total gratuity
          <span className="tip-money-input">
            <b>$</b>
            <input
              className="input"
              aria-label="Total gratuity"
              inputMode="decimal"
              value={total}
              onChange={(event) => setTotal(event.target.value)}
              onBlur={() => {
                try {
                  setTotal((moneyToCents(total) / 100).toFixed(2));
                } catch {
                  // Keep the invalid value visible so the inline error remains actionable.
                }
              }}
            />
          </span>
        </label>
        <fieldset className="tip-methods">
          <legend>Pooling rule</legend>
          {(
            [
              ["equal", "Equal", "Same share for everyone"],
              ["hours", "Hours", "Share follows hours worked"],
              ["role", "Role", "Share follows role weight"],
            ] as const
          ).map(([value, label, detail]) => (
            <label key={value} className={method === value ? "is-active" : ""}>
              <input
                type="radio"
                name="tip-method"
                value={value}
                checked={method === value}
                onChange={() => setMethod(value)}
              />
              <span>{label}</span>
              <small>{detail}</small>
            </label>
          ))}
        </fieldset>
      </section>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : !selectedEvent ? (
        <div className="tip-empty tip-no-print">
          <span>01</span>
          <h2>Choose the event that collected the gratuity.</h2>
          <p>
            Assigned staff will arrive with their scheduled hours and roles.
          </p>
        </div>
      ) : staff.length === 0 ? (
        <div className="tip-empty tip-no-print">
          <span>—</span>
          <h2>No assigned staff found.</h2>
          <p>
            Assign the event team in the Staff workspace before splitting tips.
          </p>
        </div>
      ) : (
        <>
          {method === "role" ? (
            <section className="tip-role-weights tip-no-print">
              <div>
                <p className="eyebrow">Role weights</p>
                <h2>Set the pool multiplier</h2>
              </div>
              <div className="tip-role-weight-list">
                {roles.map((role) => (
                  <label key={role} className="field-label">
                    {roleLabel(role)}
                    <input
                      className="input"
                      aria-label={`${roleLabel(role)} role weight`}
                      type="number"
                      min="0"
                      step="0.25"
                      value={weightsByRole[role] ?? 1}
                      onChange={(event) =>
                        setWeightsByRole((current) => ({
                          ...current,
                          [role]: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
          ) : null}

          <article className="tip-print-sheet">
            <header className="tip-sheet-heading">
              <div>
                <p className="eyebrow">Gratuity distribution sheet</p>
                <h2>{selectedEvent.title || "Untitled event"}</h2>
                <p>
                  {selectedEvent.startsAt
                    ? formatDate(selectedEvent.startsAt)
                    : "Date TBD"}
                  {selectedEvent.venueName
                    ? ` · ${selectedEvent.venueName}`
                    : ""}
                </p>
              </div>
              <div>
                <span>Total collected</span>
                <strong>{money.format(calculation.totalCents / 100)}</strong>
                <small>{roleLabel(method)} pool</small>
              </div>
            </header>

            {calculation.error ? (
              <p className="tip-error tip-no-print" role="alert">
                {calculation.error}
              </p>
            ) : null}

            <div className="tip-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="tip-no-print">Include</th>
                    <th>Staff member</th>
                    <th>Role</th>
                    <th>Hours</th>
                    <th>Basis</th>
                    <th>Share</th>
                    <th className="tip-signature">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((row) => {
                    const share = calculation.shares.find(
                      (item) => item.personId === row.person._id,
                    );
                    const role = String(row.assignment.role || "staff");
                    const hours =
                      hoursByPerson[row.person._id] ?? row.suggestedHours;
                    return (
                      <tr
                        key={row.person._id}
                        className={!share ? "is-excluded" : ""}
                      >
                        <td className="tip-no-print">
                          <input
                            aria-label={`Include ${personName(row.person)}`}
                            type="checkbox"
                            checked={!excluded[row.person._id]}
                            onChange={(event) =>
                              setExcluded((current) => ({
                                ...current,
                                [row.person._id]: !event.target.checked,
                              }))
                            }
                          />
                        </td>
                        <td>
                          <strong>{personName(row.person)}</strong>
                          <small>
                            {row.person.employeeNumber || "No employee #"}
                          </small>
                        </td>
                        <td>{roleLabel(role)}</td>
                        <td>
                          <input
                            className="tip-hours-input tip-no-print"
                            aria-label={`${personName(row.person)} hours`}
                            type="number"
                            min="0"
                            step="0.25"
                            value={hours}
                            onChange={(event) =>
                              setHoursByPerson((current) => ({
                                ...current,
                                [row.person._id]: Number(event.target.value),
                              }))
                            }
                          />
                          <span className="tip-print-hours">
                            {hours.toFixed(2)} h
                          </span>
                        </td>
                        <td>
                          {share
                            ? method === "equal"
                              ? "1 share"
                              : method === "hours"
                                ? `${share.basis.toFixed(2)} h`
                                : `${share.basis.toFixed(2)}×`
                            : "—"}
                        </td>
                        <td className="tip-share-cell">
                          <strong>
                            {share ? money.format(share.shareCents / 100) : "—"}
                          </strong>
                          <small>
                            {share ? `${share.sharePercent.toFixed(2)}%` : ""}
                          </small>
                        </td>
                        <td className="tip-signature">
                          <span />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="tip-no-print" />
                    <td colSpan={4}>Distribution total</td>
                    <td>{money.format(calculation.totalCents / 100)}</td>
                    <td className="tip-signature" />
                  </tr>
                </tfoot>
              </table>
            </div>
            <footer>
              Prepared in Capsule · {calculation.shares.length} recipients ·
              Every cent accounted for · Manager initials __________
            </footer>
          </article>

          <div className="tip-actions tip-no-print">
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => window.print()}
            >
              Print distribution sheet
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={
                busy ||
                calculation.error != null ||
                calculation.shares.length === 0
              }
              onClick={() => void sendToPayroll()}
            >
              {busy ? "Preparing payroll…" : "Send amounts to payroll"}
            </button>
          </div>
          <p className="tip-bridge-note tip-no-print">
            Payroll inputs are created in prepared state for review. Gratuity is
            stored inside the encrypted payroll note until encrypted money
            storage is corrected; the payroll export recognizes this versioned
            amount.
          </p>
        </>
      )}
    </div>
  );
}
