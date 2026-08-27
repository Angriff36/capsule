import { useMemo, useState, type FormEvent } from "react";
import { useAction } from "convex/react";
import { api } from "../../lib/api";
import { usePayRates } from "../facilities/useLaborSummary";
import {
  useCreatePerson,
  usePersonAssignRole,
  usePersonSetPayRate,
  usePersonUnlinkAccount,
} from "../../lib/manifest-convex-react";
import { ErrorState, Section } from "../../ui/primitives";
import { PersonRoleDirectory } from "./PersonRoleDirectory";
import { TeamRolesTable } from "./TeamRolesTable";
import type { TeamPerson } from "./TeamPerson";
import { useActionNotice, useActionFailure } from "../../ui/action-result";

export function TeamRolesPanel({
  people,
  canEdit,
}: Readonly<{
  people: readonly TeamPerson[] | undefined;
  canEdit: boolean;
}>) {
  const createPerson = useCreatePerson();
  const assignRole = usePersonAssignRole();
  const unlinkAccount = usePersonUnlinkAccount();
  const setPayRate = usePersonSetPayRate();
  const provisionSignIn = useAction(api.authProvision.provisionStaffSignIn);
  const payRates = usePayRates();
  const rateByPersonId = useMemo(
    () =>
      new Map(
        (payRates ?? []).map((row) => [row.personId, row.hourlyRate] as const),
      ),
    [payRates],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const { error, setError } = useActionFailure();
  const { notice, setNotice } = useActionNotice();

  const activePeople = useMemo(
    () =>
      (people ?? []).filter(
        (row) => row.deletedAt == null && row.status !== "terminated",
      ),
    [people],
  );

  async function sendSignIn(personId: string, name: string): Promise<void> {
    const result = await provisionSignIn({ personId: personId as never });
    setNotice(
      result.passwordIssued
        ? `Emailed ${name} a sign-in link and a password at ${result.email}.`
        : `Emailed ${name} a sign-in link at ${result.email}.`,
    );
  }

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
      const hired = (await createPerson({
        givenName,
        familyName,
        email,
        role,
        ...(phone ? { phone } : {}),
        ...(employeeNumber ? { employeeNumber } : {}),
      })) as { docId?: string };
      form.reset();
      if (!hired?.docId) {
        setNotice(
          `${givenName} ${familyName} is hired. Send them a sign-in from their row.`,
        );
        return;
      }
      try {
        await sendSignIn(hired.docId, `${givenName} ${familyName}`);
      } catch (provisionError) {
        setError(
          provisionError instanceof Error
            ? `${givenName} ${familyName} is hired, but the sign-in email failed: ${provisionError.message} Use Email sign-in on their row.`
            : `${givenName} ${familyName} is hired, but the sign-in email failed. Use Email sign-in on their row.`,
        );
      }
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Could not hire.");
    } finally {
      setBusy(null);
    }
  }

  async function onSendSignIn(person: TeamPerson) {
    if (!canEdit) return;
    setBusy(person._id);
    setError(null);
    setNotice(null);
    try {
      await sendSignIn(person._id, `${person.givenName} ${person.familyName}`);
    } catch (error_) {
      setError(
        error_ instanceof Error
          ? error_.message
          : "Could not send the sign-in.",
      );
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
        `Unlinked ${person.givenName} ${person.familyName}. Email them a new sign-in when you want them back in.`,
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
      <div className="space-y-4 border-b border-line p-4">
        <p className="max-w-3xl text-sm leading-relaxed text-ink-3">
          Hire someone and Capsule emails them a sign-in. They open that email
          and they are in the app. Their Capsule role on this row is what they
          can do — not a separate login website.
        </p>
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
        onSendSignIn={onSendSignIn}
        onUnlinkAccount={onUnlinkAccount}
        onNotice={setNotice}
        onError={setError}
        onBusy={setBusy}
      />
    </Section>
  );
}
