import { useMemo, useState } from "react";
import type { Doc } from "../../lib/api";
import { usePersonSetPayRate } from "../../lib/manifest-convex-react";
import { formatStatusLabel } from "../../lib/statusLabels";
import { Section } from "../../ui/primitives";
import { PersonPayRateCell } from "../admin/TeamRolesTable";
import type { TeamPerson } from "../admin/TeamPerson";
import { usePayRates } from "../facilities/useLaborSummary";

/**
 * Hourly pay for each active staff member, where staff are managed. Only
 * workforce and finance managers get pay rates back; everyone else sees no
 * section. Saving uses Person.setPayRate, the same command as Admin → Team.
 */
export function StaffPayRatesSection({
  people,
}: {
  readonly people: readonly Doc<"people">[] | undefined;
}) {
  const payRates = usePayRates();
  const setPayRate = usePersonSetPayRate();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const rateByPersonId = useMemo(
    () =>
      new Map((payRates ?? []).map((row) => [row.personId, row.hourlyRate])),
    [payRates],
  );

  if (!payRates || !people) return null;
  const staff = people
    .filter((person) => person.deletedAt == null && person.status === "active")
    .sort((a, b) =>
      `${a.familyName} ${a.givenName}`.localeCompare(
        `${b.familyName} ${b.givenName}`,
      ),
    );

  async function save(person: TeamPerson, hourlyRate: number) {
    setBusy(person._id);
    setMessage(null);
    try {
      await setPayRate({
        docId: person._id,
        hourlyRate,
        version: person.version,
      });
      setMessage(
        `${person.givenName} ${person.familyName} now earns $${hourlyRate.toFixed(2)} an hour.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save the pay rate.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Pay rates" count={staff.length}>
      {message ? (
        <p className="px-3 pt-2 text-sm text-ink-2" role="status">
          {message}
        </p>
      ) : null}
      <ul className="divide-y divide-line" data-testid="staff-pay-rates">
        {staff.map((person) => {
          const teamPerson: TeamPerson = {
            _id: person._id,
            givenName: person.givenName,
            familyName: person.familyName,
            email: person.email ?? "",
            role: String(person.role),
            status: String(person.status),
            version: person.version,
          };
          return (
            <li
              key={person._id}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">
                  {person.givenName} {person.familyName}
                </span>
                <span className="block truncate text-sm text-ink-2">
                  {formatStatusLabel(String(person.role))}
                </span>
              </span>
              <PersonPayRateCell
                person={teamPerson}
                rate={rateByPersonId.get(person._id) ?? null}
                canEdit
                busy={busy === person._id}
                onSetPayRate={save}
              />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
