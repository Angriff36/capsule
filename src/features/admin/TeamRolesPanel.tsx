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
import { ErrorState, Section } from "../../ui/primitives";
import { PersonRoleDirectory } from "./PersonRoleDirectory";
import { TeamRolesTable } from "./TeamRolesTable";
import type { TeamPerson } from "./TeamPerson";

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
    const employeeNumber = String(data.get("employeeNumber") ?? "").trim();
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
        ...(employeeNumber ? { employeeNumber } : {}),
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
            <span className="meta-term">Employee number</span>
            <input
              name="employeeNumber"
              className="input mt-1"
              autoComplete="off"
            />
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
        onNotice={setNotice}
        onError={setError}
        onBusy={setBusy}
      />
    </Section>
  );
}
