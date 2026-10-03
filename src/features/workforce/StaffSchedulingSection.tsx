import { useState } from "react";
import type { Doc } from "../../lib/api";
import {
  usePersonSetSchedulingHold,
  usePersonSetStaffingVendor,
  usePersonSetWorkPreferences,
  useListVendor,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";

const list = (value: string) =>
  value
    .split(",")
    .map((row) => row.trim())
    .filter(Boolean);

/** One plain line of a person's scheduling facts, or "". */
export function schedulingSummary(person: {
  preferredRoles?: string[] | null;
  approvedWorkLocations?: string[] | null;
  staffingVendor?: string | null;
  schedulingHoldReason?: string | null;
}): string {
  return [
    person.schedulingHoldReason
      ? `Do not schedule: ${person.schedulingHoldReason}`
      : null,
    person.preferredRoles?.length
      ? `Prefers ${person.preferredRoles.join(", ")}`
      : null,
    person.approvedWorkLocations?.length
      ? `Only at ${person.approvedWorkLocations.join(", ")}`
      : null,
    person.staffingVendor ? `Agency: ${person.staffingVendor}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Agencies to offer: the company's active vendors, then the agency names
 * already on people. One entry per spelling-insensitive name.
 */
export function agencyChoices(
  vendorNames: ReadonlyArray<string>,
  people: ReadonlyArray<{ staffingVendor?: string | null }>,
): string[] {
  const byKey = new Map<string, string>();
  const add = (name: string | null | undefined) => {
    const trimmed = name?.trim().replace(/\s+/g, " ");
    if (trimmed && !byKey.has(nameKey(trimmed))) {
      byKey.set(nameKey(trimmed), trimmed);
    }
  };
  vendorNames.forEach(add);
  people.forEach((person) => add(person.staffingVendor));
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

/** A typed agency in another spelling saves as the known agency's name. */
export function matchAgency(
  typed: string,
  agencies: ReadonlyArray<string>,
): string | undefined {
  const trimmed = typed.trim();
  if (!trimmed) return undefined;
  return (
    agencies.find((agency) => nameKey(agency) === nameKey(trimmed)) ?? trimmed
  );
}

/**
 * Who prefers which roles, where each person is approved to work, agency
 * workers, and a "do not schedule" note (AC-505/511). These shape staffing
 * suggestions and auto-fill; a manager can still assign anyone by hand.
 */
export function StaffSchedulingSection({
  people,
}: {
  people: Doc<"people">[];
}) {
  const setPreferences = usePersonSetWorkPreferences();
  const setHold = usePersonSetSchedulingHold();
  const setVendor = usePersonSetStaffingVendor();
  const vendors = useListVendor();
  const agencies = agencyChoices(
    (vendors ?? [])
      .filter(
        (vendor) => vendor.deletedAt == null && vendor.status === "active",
      )
      .map((vendor) => vendor.name),
    people,
  );
  const { prompt, host } = useActionPrompt();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const roster = [...people].sort((a, b) =>
    `${a.givenName} ${a.familyName}`.localeCompare(
      `${b.givenName} ${b.familyName}`,
    ),
  );

  const edit = async (person: Doc<"people">) => {
    const values = await prompt.askFields({
      title: `Scheduling for ${person.givenName} ${person.familyName}`,
      description:
        "Separate several roles or places with commas. Leave a box empty to clear it.",
      fields: [
        {
          name: "preferredRoles",
          label: "Roles they prefer",
          required: false,
          placeholder: "e.g. Server, Bartender",
          defaultValue: (person.preferredRoles ?? []).join(", "),
        },
        {
          name: "approvedWorkLocations",
          label: "Only approved to work at",
          required: false,
          placeholder: "Empty = anywhere",
          defaultValue: (person.approvedWorkLocations ?? []).join(", "),
        },
        {
          name: "staffingVendor",
          label: "Staffing agency",
          required: false,
          placeholder: "Empty = our own staff",
          defaultValue: person.staffingVendor ?? "",
          suggestions: agencies,
          helper: "Pick one of your vendors, or type the agency's name.",
        },
        {
          name: "schedulingHoldReason",
          label: "Do not schedule (reason)",
          required: false,
          placeholder: "Empty = can be scheduled",
          defaultValue: person.schedulingHoldReason ?? "",
        },
      ],
      confirmLabel: "Save",
    });
    if (!values) return;
    setBusy(person._id);
    setFailure(null);
    try {
      let version = person.version;
      await setPreferences({
        docId: person._id,
        version: version++,
        preferredRoles: list(values.preferredRoles ?? ""),
        approvedWorkLocations: list(values.approvedWorkLocations ?? ""),
      });
      await setVendor({
        docId: person._id,
        version: version++,
        vendorName: matchAgency(values.staffingVendor ?? "", agencies),
      });
      await setHold({
        docId: person._id,
        version: version++,
        reason: values.schedulingHoldReason?.trim() || undefined,
      });
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="working-ledger" data-testid="staff-scheduling-section">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Scheduling</p>
          <h2>Preferences, places and agency staff</h2>
        </div>
      </div>
      <p className="mt-1 max-w-160 text-base leading-relaxed text-ink-2">
        These decide who is suggested for open shifts. Anyone can still be
        assigned by hand.
      </p>
      {host}
      {failure ? <WorkforceFailureBanner error={failure} /> : null}
      <div className="mt-3 divide-y divide-line-2">
        {roster.map((person) => (
          <div
            key={person._id}
            className="flex items-center justify-between gap-4 py-3"
          >
            <div className="min-w-0">
              <strong className="block truncate">
                {person.givenName} {person.familyName}
              </strong>
              <small className="text-ink-3">
                {schedulingSummary(person) || "No preferences set"}
              </small>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy != null}
              onClick={() => void edit(person)}
            >
              Edit
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
