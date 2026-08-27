import { formatStatusLabel } from "../../lib/statusLabels";
import { EmptyState, TableSkeleton } from "../../ui/primitives";
import { PersonEmployeeNumberField } from "./PersonEmployeeNumberField";
import { PersonRoleDirectory } from "./PersonRoleDirectory";
import type { TeamPerson } from "./TeamPerson";

export function TeamRolesTable({
  people,
  activePeople,
  canEdit,
  busy,
  onAssignRole,
  onSetPayRate,
  rateByPersonId,
  clerkMembers,
  linkedSubjectIds,
  onLinkAccount,
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
  clerkMembers: readonly {
    userId: string;
    name: string;
    identifier?: string | null;
  }[];
  linkedSubjectIds: ReadonlySet<string>;
  onLinkAccount: (person: TeamPerson, authSubjectId: string) => Promise<void>;
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
        hint="Hire people here and link their Clerk sign-in. Until then, Capsule falls back to the Clerk org role claim."
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-180 border-collapse text-left">
        <thead>
          <tr>
            <th className="th">Member</th>
            <th className="th">Linked sign-in</th>
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
                <PersonLinkCell
                  person={person}
                  canEdit={canEdit}
                  busy={busy === person._id}
                  clerkMembers={clerkMembers}
                  linkedSubjectIds={linkedSubjectIds}
                  onLink={onLinkAccount}
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

function PersonLinkCell({
  person,
  canEdit,
  busy,
  clerkMembers,
  linkedSubjectIds,
  onLink,
  onUnlink,
}: Readonly<{
  person: TeamPerson;
  canEdit: boolean;
  busy: boolean;
  clerkMembers: readonly {
    userId: string;
    name: string;
    identifier?: string | null;
  }[];
  linkedSubjectIds: ReadonlySet<string>;
  onLink: (person: TeamPerson, authSubjectId: string) => Promise<void>;
  onUnlink: (person: TeamPerson) => Promise<void>;
}>) {
  if (person.authSubjectId) {
    const member = clerkMembers.find(
      (row) => row.userId === person.authSubjectId,
    );
    return (
      <div className="grid gap-1">
        <span className="text-ink-2">{member?.name ?? "Linked account"}</span>
        <code className="font-mono text-2xs text-ink-3">
          {person.authSubjectId}
        </code>
        {canEdit ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm justify-self-start"
            disabled={busy}
            onClick={() => void onUnlink(person)}
          >
            {busy ? "Working…" : "Unlink"}
          </button>
        ) : null}
      </div>
    );
  }

  if (!canEdit) {
    return (
      <span className="text-warn">Not linked — still using Clerk role</span>
    );
  }

  // Only accounts not already claimed by another staff row.
  // Only the provider account whose verified primary email is THIS row's
  // email — never another staff member's account.
  const personEmail = person.email.trim().toLowerCase();
  const available = clerkMembers.filter(
    (row) =>
      !linkedSubjectIds.has(row.userId) &&
      (row.identifier ?? "").trim().toLowerCase() === personEmail,
  );

  return (
    <div className="grid gap-1">
      <span className="text-warn">Not linked — still using Clerk role</span>
      {available.length === 0 ? (
        <span className="text-ink-3">
          No sign-in matches an unlinked staff email yet. Ask them to sign in
          once, then retry.
        </span>
      ) : (
        <select
          className="input"
          defaultValue=""
          disabled={busy}
          onChange={(event) => {
            const value = event.target.value;
            if (value) void onLink(person, value);
          }}
        >
          <option value="">{busy ? "Working…" : "Link an account…"}</option>
          {available.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
              {member.identifier ? ` · ${member.identifier}` : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
