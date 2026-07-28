import { useMemo, useState, type FormEvent } from "react";
import { useOrganization, useUser } from "@clerk/react";
import {
  useCreatePerson,
  usePersonAssignRole,
  usePersonLinkAccount,
  usePersonUnlinkAccount,
} from "../../lib/manifest-convex-react";
import { formatStatusLabel } from "../../lib/statusLabels";
import {
  EmptyState,
  ErrorState,
  Section,
  TableSkeleton,
} from "../../ui/primitives";
import { PersonRoleDirectory } from "./PersonRoleDirectory";

type TeamPerson = {
  _id: string;
  givenName: string;
  familyName: string;
  email: string;
  role: string;
  status: string;
  authSubjectId?: string | null;
  deletedAt?: unknown;
  version?: number;
};

export function TeamRolesPanel({
  people,
  canEdit,
}: Readonly<{
  people: readonly TeamPerson[] | undefined;
  canEdit: boolean;
}>) {
  const createPerson = useCreatePerson();
  const assignRole = usePersonAssignRole();
  const linkAccount = usePersonLinkAccount();
  const unlinkAccount = usePersonUnlinkAccount();
  const { user } = useUser();
  const { memberships } = useOrganization({
    memberships: { infinite: true, pageSize: 50 },
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activePeople = useMemo(
    () =>
      (people ?? []).filter(
        (row) => row.deletedAt == null && row.status !== "terminated",
      ),
    [people],
  );

  const clerkMembers = useMemo(() => {
    const data = memberships?.data ?? [];
    return data
      .map((membership) => {
        const profile = membership.publicUserData;
        const userId = profile?.userId;
        if (!profile || !userId) return null;
        const name =
          [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
          profile.identifier ||
          userId;
        return { userId, name, identifier: profile.identifier };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }, [memberships?.data]);

  // Two staff rows sharing one sign-in would make getAuthContext's lookup
  // ambiguous (it takes .first()), so an account already spoken for is not
  // offered again.
  const linkedSubjectIds = useMemo(
    () =>
      new Set(
        activePeople
          .map((row) => row.authSubjectId)
          .filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
      ),
    [activePeople],
  );

  async function onHire(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const givenName = String(data.get("givenName") ?? "").trim();
    const familyName = String(data.get("familyName") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const role = String(data.get("role") ?? "staff");
    const authSubjectId = String(data.get("authSubjectId") ?? "").trim();
    if (!givenName || !familyName || !email) {
      setError("First name, last name, and email are required.");
      return;
    }
    if (!PersonRoleDirectory.isAssignable(role)) {
      setError("Pick a Capsule role from the list.");
      return;
    }
    setBusy("hire");
    setError(null);
    setNotice(null);
    try {
      await createPerson({
        givenName,
        familyName,
        email,
        role,
        ...(authSubjectId ? { authSubjectId } : {}),
      });
      form.reset();
      setNotice(
        authSubjectId
          ? "Team member hired and linked. Their Capsule role now comes from this record, not Clerk."
          : "Team member hired. Link their Clerk user id so sign-in uses this Capsule role.",
      );
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Could not hire.");
    } finally {
      setBusy(null);
    }
  }

  async function onLinkAccount(person: TeamPerson, authSubjectId: string) {
    if (!canEdit || !authSubjectId) return;
    setBusy(person._id);
    setError(null);
    setNotice(null);
    try {
      await linkAccount({
        docId: person._id,
        authSubjectId,
        version: person.version,
      });
      setNotice(
        `Linked ${person.givenName} ${person.familyName}. They can now use their day sheet, comments, and self-service pages.`,
      );
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Could not link.");
    } finally {
      setBusy(null);
    }
  }

  async function onUnlinkAccount(person: TeamPerson) {
    if (!canEdit) return;
    setBusy(person._id);
    setError(null);
    setNotice(null);
    try {
      await unlinkAccount({ docId: person._id, version: person.version });
      setNotice(
        `Unlinked ${person.givenName} ${person.familyName}. Their Capsule role falls back to Clerk until relinked.`,
      );
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Could not unlink.");
    } finally {
      setBusy(null);
    }
  }

  async function onAssignRole(person: TeamPerson, role: string) {
    if (!canEdit || !PersonRoleDirectory.isAssignable(role)) return;
    if (role === person.role) return;
    setBusy(person._id);
    setError(null);
    setNotice(null);
    try {
      await assignRole({
        docId: person._id,
        role,
        version: person.version,
      });
      setNotice(
        `Updated ${person.givenName} ${person.familyName} to ${PersonRoleDirectory.label(role)}.`,
      );
    } catch (error_) {
      setError(
        error_ instanceof Error ? error_.message : "Could not change role.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Team roles" count={activePeople.length}>
      <div className="space-y-4 border-b border-line p-4">
        <p className="max-w-3xl text-[12px] leading-relaxed text-ink-3">
          Capsule permissions come from the role on each hired team member once
          they are linked to a sign-in. Clerk only proves who signed in and
          which organization they belong to — it does not decide kitchen vs
          sales vs admin inside Capsule.
        </p>
        {user?.id ? (
          <p className="text-[11px] text-ink-3">
            Your Clerk user id (paste when hiring yourself):{" "}
            <code className="font-mono text-ink-2">{user.id}</code>
          </p>
        ) : null}
        {error ? (
          <ErrorState title="Team role update failed" detail={error} />
        ) : null}
        {notice ? (
          <output className="banner banner-ok block text-[13px]">
            {notice}
          </output>
        ) : null}
      </div>

      {canEdit ? (
        <form
          className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => void onHire(event)}
        >
          <label className="block text-[12px]">
            <span className="meta-term">First name</span>
            <input name="givenName" className="input mt-1" required />
          </label>
          <label className="block text-[12px]">
            <span className="meta-term">Last name</span>
            <input name="familyName" className="input mt-1" required />
          </label>
          <label className="block text-[12px]">
            <span className="meta-term">Email</span>
            <input name="email" type="email" className="input mt-1" required />
          </label>
          <label className="block text-[12px]">
            <span className="meta-term">Capsule role</span>
            <select name="role" className="input mt-1" defaultValue="admin">
              {PersonRoleDirectory.ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {PersonRoleDirectory.label(role)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[12px] sm:col-span-2">
            <span className="meta-term">Link Clerk member</span>
            <select name="authSubjectId" className="input mt-1" defaultValue="">
              <option value="">Link later</option>
              {clerkMembers.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                  {member.identifier ? ` · ${member.identifier}` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy != null}
            >
              {busy === "hire" ? "Hiring…" : "Hire team member"}
            </button>
          </div>
        </form>
      ) : null}

      <TeamRolesTable
        people={people}
        activePeople={activePeople}
        canEdit={canEdit}
        busy={busy}
        onAssignRole={onAssignRole}
        clerkMembers={clerkMembers}
        linkedSubjectIds={linkedSubjectIds}
        onLinkAccount={onLinkAccount}
        onUnlinkAccount={onUnlinkAccount}
      />
    </Section>
  );
}

function TeamRolesTable({
  people,
  activePeople,
  canEdit,
  busy,
  onAssignRole,
  clerkMembers,
  linkedSubjectIds,
  onLinkAccount,
  onUnlinkAccount,
}: Readonly<{
  people: readonly TeamPerson[] | undefined;
  activePeople: readonly TeamPerson[];
  canEdit: boolean;
  busy: string | null;
  onAssignRole: (person: TeamPerson, role: string) => Promise<void>;
  clerkMembers: readonly {
    userId: string;
    name: string;
    identifier?: string | null;
  }[];
  linkedSubjectIds: ReadonlySet<string>;
  onLinkAccount: (person: TeamPerson, authSubjectId: string) => Promise<void>;
  onUnlinkAccount: (person: TeamPerson) => Promise<void>;
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
          </tr>
        </thead>
        <tbody>
          {activePeople.map((person) => (
            <tr key={person._id}>
              <td className="border-b border-line px-3 py-3">
                <strong className="block text-ink">
                  {person.givenName} {person.familyName}
                </strong>
                <span className="mt-0.5 block text-[11px] text-ink-3">
                  {person.email} · {formatStatusLabel(person.status)}
                </span>
              </td>
              <td className="border-b border-line px-3 py-3 text-[11px]">
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
        <code className="font-mono text-[10px] text-ink-3">
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
  const available = clerkMembers.filter(
    (row) => !linkedSubjectIds.has(row.userId),
  );

  return (
    <div className="grid gap-1">
      <span className="text-warn">Not linked — still using Clerk role</span>
      {available.length === 0 ? (
        <span className="text-ink-3">
          No unlinked workspace accounts available.
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
