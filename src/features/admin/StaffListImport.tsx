// Bring in the old system's Staff Address & Phone List (.xlsx). The office
// sees what each row will do first: add a team member, fill a blank phone or
// address of someone already here, or nothing. Nobody is emailed a sign-in;
// the office sends that from the person's row when they want them in the app.
import { useState, type ChangeEvent } from "react";
import { formatCountNoun } from "../../lib/format";
import {
  usePersonChangeAddress,
  usePersonCorrectIdentity,
  useCreatePerson,
} from "../../lib/manifest-convex-react";
import {
  isTppStaffList,
  planStaffList,
  readTppStaffList,
  type StaffListStep,
} from "../../lib/tppStaffList";
import { readXlsxSheetsFromEntries } from "../../lib/tppReports/xlsxWorkbookParser";
import { readZipEntriesInBrowser } from "../../lib/tppReports/zipReaderBrowser";
import type { TeamPerson } from "./TeamPerson";

const optional = (value: string | null | undefined) =>
  value && value.trim() ? value : undefined;

function stepText(step: StaffListStep): string {
  const { row } = step;
  const name = `${row.givenName} ${row.familyName}`.trim();
  const contact = [row.email, row.phone].filter(Boolean).join(", ");
  switch (step.kind) {
    case "add":
      return `${name} (${contact}): add to the team.`;
    case "fill":
      return `${name}: already here. Fill in the blank ${[
        step.phone ? `phone (${step.phone})` : "",
        step.address ? `address (${step.address})` : "",
      ]
        .filter(Boolean)
        .join(" and ")}.`;
    case "same":
      return `${name}: already here. Nothing to change.`;
    case "cannotAdd":
      return `${name}: not added. The list has no email for them; use Hire team member above.`;
  }
}

export function StaffListImport({
  people,
  onSaved,
}: Readonly<{
  people: readonly TeamPerson[];
  onSaved: (message: string) => void;
}>) {
  const createPerson = useCreatePerson();
  const correctIdentity = usePersonCorrectIdentity();
  const changeAddress = usePersonChangeAddress();
  const [steps, setSteps] = useState<StaffListStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setSteps(null);
    try {
      const entries = await readZipEntriesInBrowser(
        new Uint8Array(await file.arrayBuffer()),
      );
      const grid = readXlsxSheetsFromEntries(entries)[0]?.rows ?? [];
      if (!isTppStaffList(grid)) {
        setError(
          `${file.name} is not the old system's Staff Address & Phone List. Use that report saved as Excel (.xlsx).`,
        );
        return;
      }
      setSteps(planStaffList(readTppStaffList(grid), people));
    } catch {
      setError(`${file.name} could not be read. Use the report's .xlsx file.`);
    }
  };

  const save = async () => {
    if (!steps) return;
    setBusy(true);
    setError(null);
    let added = 0;
    let filled = 0;
    try {
      for (const step of steps) {
        if (step.kind === "add") {
          const created = await createPerson({
            givenName: step.row.givenName,
            familyName: step.row.familyName,
            email: step.row.email,
            role: "staff",
            ...(step.row.phone ? { phone: step.row.phone } : {}),
          });
          if (step.row.address) {
            await changeAddress({
              docId: created.docId,
              addressLine1: step.row.address,
            });
          }
          added += 1;
        } else if (step.kind === "fill") {
          const person = people.find((one) => one._id === step.person._id);
          if (!person) continue;
          if (step.phone) {
            await correctIdentity({
              docId: person._id as never,
              version: person.version,
              givenName: person.givenName,
              familyName: person.familyName,
              phone: step.phone,
            });
          }
          if (step.address) {
            await changeAddress({
              docId: person._id as never,
              addressLine1: step.address,
              addressLine2: optional(person.addressLine2),
              city: optional(person.city),
              region: optional(person.region),
              postalCode: optional(person.postalCode),
            });
          }
          filled += 1;
        }
      }
      setSteps(null);
      onSaved(
        `Old staff list saved: ${formatCountNoun(added, "person", "people")} added, ${formatCountNoun(filled, "person", "people")} filled in. Send a sign-in from a row when they should use the app.`,
      );
    } catch (cause: unknown) {
      const reason =
        cause instanceof Error ? cause.message : "The list was not saved.";
      setError(
        added + filled > 0
          ? `${reason} The ones saved before it stopped are kept; read the file again to finish.`
          : reason,
      );
    } finally {
      setBusy(false);
    }
  };

  const changes = steps?.filter(
    (step) => step.kind === "add" || step.kind === "fill",
  ).length;

  return (
    <details
      className="border-b border-line p-4 text-sm"
      data-testid="staff-list-import"
    >
      <summary className="cursor-pointer font-semibold text-ink-2">
        Bring in the old system&apos;s staff list
      </summary>
      <div className="mt-2 max-w-3xl space-y-3">
        <p className="text-ink-2">
          Use the old system&apos;s Staff Address &amp; Phone List saved as
          Excel (.xlsx). New people are added as Staff with their email and
          phone. People already here keep what Capsule has; only a blank phone
          or address is filled in. Nobody is emailed until you send a sign-in
          from their row.
        </p>
        <label className="field-label max-w-full min-w-0">
          Staff list file
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => void handleFile(event)}
            disabled={busy}
            className="max-w-full text-xs"
            data-testid="staff-list-file"
          />
        </label>
        {steps ? (
          <div className="space-y-2">
            <ul className="list-disc pl-5 text-ink-2">
              {steps.map((step) => (
                <li
                  key={`${step.row.familyName}-${step.row.givenName}-${step.row.email ?? ""}`}
                >
                  {stepText(step)}
                  {step.row.otherPhones.length > 0
                    ? ` Other number on the list, not kept: ${step.row.otherPhones.join(", ")}.`
                    : ""}
                </li>
              ))}
            </ul>
            {changes ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy
                  ? "Saving…"
                  : `Save ${formatCountNoun(changes, "change")}`}
              </button>
            ) : (
              <p className="text-ink-2" role="status">
                Everyone on the list is already here. Nothing to save.
              </p>
            )}
          </div>
        ) : null}
        {error ? (
          <p className="text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}
