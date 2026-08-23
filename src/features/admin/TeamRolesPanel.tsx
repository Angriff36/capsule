import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useUser } from "@clerk/react";
import { useAction } from "convex/react";
import { api } from "../../lib/api";
import { usePayRates } from "../facilities/useLaborSummary";
import {
  useCreatePerson,
  usePersonAssignRole,
  usePersonLinkAccount,
  usePersonSetPayRate,
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
  const setPayRate = usePersonSetPayRate();
  // hourlyRate is private (stripped from listPerson); rates come from the
  // laborSummary seam, readable by workforce/finance managers and admins.
  const payRates = usePayRates();
  const rateByPersonId = useMemo(
    () =>
      new Map(
        (payRates ?? []).map((row) => [row.personId, row.hourlyRate] as const),
      ),
    [payRates],
  );
  const { user } = useUser();
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

  // Sign-ins known to the identity provider (admin-only, tenant-scoped action)
  // — covers admin-capable staff that self-link refuses.
  const listSignIns = useAction(api.authLink.listSignIns);
  const [signIns, setSignIns] = useState<
    Array<{ userId: string; name: string; email: string | null }>
  >([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const loadSignIns = useCallback(() => {
    listSignIns({})
      .then((catalog) => {
        setSignIns(catalog.signIns);
        setCatalogError(
          catalog.error === "not_configured"
            ? "Sign-in list unavailable: CLERK_SECRET_KEY is not set on this deployment."
            : catalog.error === "provider_error"
              ? "Sign-in list unavailable: the sign-in service did not answer."
              : null,
        );
      })
      .catch(() =>
        setCatalogError("Sign-in list unavailable: the request failed."),
      );
  }, [listSignIns]);
  // Reload when the roster changes (a hire or unlink makes new emails wanted).
  const unlinkedKey = (people ?? [])
    .filter(
      (row) =>
        row.deletedAt == null &&
        String(row.status) === "active" &&
        !row.authSubjectId,
    )
    .map((row) => row._id)
    .join(",");
  useEffect(() => {
    loadSignIns();
  }, [loadSignIns, unlinkedKey]);

  // Tenant-scoped catalog from the server (convex/authLink.ts): only
  // sign-ins whose email matches one of this tenant's unlinked staff rows.
  const clerkMembers = useMemo(
    () =>
      signIns.map((row) => ({
        userId: row.userId,
        name: row.name,
        identifier: row.email ?? undefined,
      })),
    [signIns],
  );

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
    const phone = String(data.get("phone") ?? "").trim();
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
        ...(phone ? { phone } : {}),
        ...(authSubjectId ? { authSubjectId } : {}),
      });
      form.reset();
      setNotice(
        authSubjectId
          ? "Team member hired and linked. Their Capsule role now comes from this record."
          : "Team member hired. When they sign in with this email their account links on its own; admin-role staff get linked here in their row.",
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

  async function onSetPayRate(person: TeamPerson, hourlyRate: number) {
    if (!canEdit) return;
    setBusy(person._id);
    setError(null);
    setNotice(null);
    try {
      await setPayRate({
        docId: person._id,
        hourlyRate,
        version: person.version,
      });
      setNotice(
        `Set ${person.givenName} ${person.familyName} to $${hourlyRate.toFixed(2)}/h. Labor costs and payroll estimates now use this rate.`,
      );
    } catch (error_) {
      setError(
        error_ instanceof Error ? error_.message : "Could not set pay rate.",
      );
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
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
        {catalogError ? (
          <span className="text-warn">{catalogError}</span>
        ) : (
          <span>
            Sign-ins that match an unlinked staff email appear in each row's
            account picker.
          </span>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={loadSignIns}
        >
          Refresh sign-ins
        </button>
      </p>
      <div className="space-y-4 border-b border-line p-4">
        <p className="max-w-3xl text-sm leading-relaxed text-ink-3">
          Capsule permissions come from the role on each hired team member once
          they are linked to a sign-in. Clerk only proves who signed in and
          which organization they belong to — it does not decide kitchen vs
          sales vs admin inside Capsule.
        </p>
        {user?.id ? (
          <p className="text-xs text-ink-3">
            Your Clerk user id (paste when hiring yourself):{" "}
            <code className="font-mono text-ink-2">{user.id}</code>
          </p>
        ) : null}
        {error ? (
          <ErrorState title="Team role update failed" detail={error} />
        ) : null}
        {notice ? (
          <output className="banner banner-ok block text-base">{notice}</output>
        ) : null}
      </div>

      {canEdit ? (
        <form
          className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => void onHire(event)}
        >
          <label className="block text-sm">
            <span className="meta-term">First name</span>
            <input name="givenName" className="input mt-1" required />
          </label>
          <label className="block text-sm">
            <span className="meta-term">Last name</span>
            <input name="familyName" className="input mt-1" required />
          </label>
          <label className="block text-sm">
            <span className="meta-term">Email</span>
            <input name="email" type="email" className="input mt-1" required />
          </label>
          <label className="block text-sm">
            <span className="meta-term">Phone (for SMS alerts)</span>
            <input name="phone" type="tel" className="input mt-1" />
          </label>
          <label className="block text-sm">
            <span className="meta-term">Capsule role</span>
            <select name="role" className="input mt-1" defaultValue="admin">
              {PersonRoleDirectory.ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {PersonRoleDirectory.label(role)}
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
        onSetPayRate={onSetPayRate}
        rateByPersonId={rateByPersonId}
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
  onSetPayRate,
  rateByPersonId,
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
  const available = clerkMembers.filter(
    (row) => !linkedSubjectIds.has(row.userId),
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
