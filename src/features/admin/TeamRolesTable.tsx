import { formatStatusLabel } from "../../lib/statusLabels";
import { EmptyState, TableSkeleton } from "../../ui/primitives";
import { PersonEmployeeNumberField } from "./PersonEmployeeNumberField";
import { PersonRoleDirectory } from "./PersonRoleDirectory";
import { StaffSignInCell } from "./StaffSignInCell";
import type { TeamPerson } from "./TeamPerson";

export function TeamRolesTable({
  people,
  activePeople,
  canEdit,
  busy,
  onAssignRole,
  onSetPayRate,
  rateByPersonId,
  onSendSignIn,
  onUnlinkAccount,
  onNotice,
  onError,
  onBusy,
}: Readonly<{
  people: readonly TeamPerson[] | undefined;
  activePeople: readonly TeamPerson[];
  canEdit: boolean;
  busy: string | null;
  onAssignRole: (person: TeamPerson, role: string) => Promise<void>;
  onSetPayRate: (person: TeamPerson, hourlyRate: number) => Promise<void>;
  rateByPersonId: ReadonlyMap<string, number | null>;
  onSendSignIn: (person: TeamPerson) => Promise<void>;
  onUnlinkAccount: (person: TeamPerson) => Promise<void>;
  onNotice: (message: string | null) => void;
  onError: (message: string | null) => void;
  onBusy: (key: string | null) => void;
}>) {
  if (people === undefined) {
    return <TableSkeleton rows={3} columns={3} />;
  }
  if (activePeople.length === 0) {
    return (
      <EmptyState
        title="No hired team members yet"
        hint="Hire someone here and Capsule emails them a sign-in. They open the app from that email."
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-180 border-collapse text-left">
        <thead>
          <tr>
            <th className="th">Member</th>
            <th className="th">Sign-in</th>
            <th className="th">Capsule role</th>
            <th className="th">Employee number</th>
            <th className="th">Hourly rate</th>
          </tr>
        </thead>
        <tbody>
          {activePeople.map((person) => (
            <tr key={person._id}>
              <td className="border-b border-line px-3 py-3">
                <strong className="block text-ink">
                  {person.givenName} {person.familyName}
                </strong>
                <span className="mt-0.5 block text-xs text-ink-3">
                  {person.email} · {formatStatusLabel(person.status)}
                </span>
              </td>
              <td className="border-b border-line px-3 py-3 text-xs">
                <StaffSignInCell
                  person={person}
                  canEdit={canEdit}
                  busy={busy === person._id}
                  onSendSignIn={onSendSignIn}
                  onUnlink={onUnlinkAccount}
                />
              </td>
              <td className="border-b border-line px-3 py-3">
                <PersonRoleCell
                  person={person}
                  canEdit={canEdit}
                  busy={busy === person._id}
                  onAssignRole={onAssignRole}
                />
              </td>
              <td className="border-b border-line px-3 py-3">
                <PersonEmployeeNumberField
                  personId={person._id}
                  personName={`${person.givenName} ${person.familyName}`}
                  currentNumber={person.employeeNumber}
                  version={person.version}
                  canEdit={canEdit}
                  busy={busy === person._id}
                  onBusy={(isBusy) => onBusy(isBusy ? person._id : null)}
                  onSaved={(employeeNumber) => {
                    onError(null);
                    onNotice(
                      `Set ${person.givenName} ${person.familyName} employee number to ${employeeNumber}. Payroll export can use this instead of a Capsule ID.`,
                    );
                  }}
                  onError={onError}
                />
              </td>
              <td className="border-b border-line px-3 py-3">
                <PersonPayRateCell
                  person={person}
                  rate={rateByPersonId.get(person._id) ?? null}
                  canEdit={canEdit}
                  busy={busy === person._id}
                  onSetPayRate={onSetPayRate}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PersonRoleCell({
  person,
  canEdit,
  busy,
  onAssignRole,
}: Readonly<{
  person: TeamPerson;
  canEdit: boolean;
  busy: boolean;
  onAssignRole: (person: TeamPerson, role: string) => Promise<void>;
}>) {
  if (!canEdit) {
    return (
      <span className="chip border-line-2 bg-inset text-ink-2">
        {PersonRoleDirectory.label(person.role)}
      </span>
    );
  }
  return (
    <select
      className="input"
      value={person.role}
      disabled={busy}
      onChange={(event) => void onAssignRole(person, event.target.value)}
    >
      {PersonRoleDirectory.ASSIGNABLE_ROLES.map((role) => (
        <option key={role} value={role}>
          {PersonRoleDirectory.label(role)}
        </option>
      ))}
      {PersonRoleDirectory.isAssignable(person.role) ? null : (
        <option value={person.role}>{person.role}</option>
      )}
    </select>
  );
}

function PersonPayRateCell({
  person,
  rate,
  canEdit,
  busy,
  onSetPayRate,
}: Readonly<{
  person: TeamPerson;
  rate: number | null;
  canEdit: boolean;
  busy: boolean;
  onSetPayRate: (person: TeamPerson, hourlyRate: number) => Promise<void>;
}>) {
  // null = never set; 0 is a valid volunteer/zero rate.
  const hasRate = rate != null;

  if (!canEdit) {
    return hasRate ? (
      <span className="text-ink-2">${rate.toFixed(2)}/h</span>
    ) : (
      <span className="text-warn">No rate set</span>
    );
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const raw = String(
          new FormData(event.currentTarget).get("hourlyRate") ?? "",
        ).trim();
        if (raw === "") return;
        const value = Number(raw);
        if (Number.isFinite(value) && value >= 0 && value !== rate) {
          void onSetPayRate(person, value);
        }
      }}
    >
      <input
        key={rate ?? "unset"}
        name="hourlyRate"
        className="input w-24"
        type="number"
        min="0"
        step="0.01"
        defaultValue={hasRate ? rate.toFixed(2) : ""}
        placeholder="0.00"
        aria-label={`Hourly rate for ${person.givenName} ${person.familyName}`}
        disabled={busy}
      />
      <button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>
        {busy ? "…" : "Set"}
      </button>
      {hasRate ? null : <span className="text-xs text-warn">unset</span>}
    </form>
  );
}
