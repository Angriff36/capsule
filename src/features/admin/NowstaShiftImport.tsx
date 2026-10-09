// Bring in past shifts from a Nowsta Time & Attendance export. The office
// sees what each row will do first; Save adds any new workers as Staff (no
// sign-in is emailed) and writes each past shift, finished, under its worker
// and its event. Nothing is sent to anyone, and no hours reach the time sheet
// or payroll.
import { useConvex, useMutation } from "convex/react";
import { useState, type ChangeEvent } from "react";
import { api } from "../../lib/api";
import { formatCountNoun, formatDate, formatTime } from "../../lib/format";
import { useCreatePerson } from "../../lib/manifest-convex-react";
import {
  isNowstaTimeAttendance,
  planNowstaShifts,
  readNowstaShifts,
  type NowstaRowMatch,
  type NowstaShiftRow,
  type NowstaStep,
} from "../../lib/nowstaShiftHistory";
import { sourceFileGrid } from "./import/sourceFileGrid";
import type { TeamPerson } from "./TeamPerson";

// Rows per server read (convex/nowstaShiftHistory.ts NOWSTA_MATCH_ROWS).
const MATCH_ROWS = 200;

function rowText(row: NowstaShiftRow): string {
  const name = `${row.givenName} ${row.familyName}`.trim();
  const worked =
    row.actualStartsAt != null && row.actualEndsAt != null
      ? `, worked ${formatTime(row.actualStartsAt)}–${formatTime(row.actualEndsAt)}`
      : "";
  return `${name}, ${row.position || "no position"}, ${row.eventName} on ${formatDate(row.dayStart)} ${formatTime(row.startsAt)}–${formatTime(row.endsAt)}${worked}`;
}

function stepText(step: NowstaStep): string {
  const { row } = step;
  const name = `${row.givenName} ${row.familyName}`.trim();
  switch (step.kind) {
    case "done":
      return `${rowText(row)}: brought in before.`;
    case "ahead":
      return `${rowText(row)}: still ahead, not brought in. Plan coming shifts in Capsule.`;
    case "noEvent":
      return `${rowText(row)}: waits. No Capsule event is named "${row.eventName}" on ${formatDate(row.dayStart)}. Bring the event in, then read the file again.`;
    case "twoEvents":
      return `${rowText(row)}: waits. Two Capsule events are named "${row.eventName}" on ${formatDate(row.dayStart)}. Rename one, then read the file again.`;
    case "noPerson":
      return `${rowText(row)}: waits. ${name} is not on the team and the file has no email for them. Add them with Hire team member, then read the file again.`;
    case "save":
      return step.personId
        ? `${rowText(row)}: save.`
        : `${rowText(row)}: add ${name} (${row.email}) to the team as Staff, then save.`;
  }
}

export function NowstaShiftImport({
  people,
  onSaved,
}: Readonly<{
  people: readonly TeamPerson[];
  onSaved: (message: string) => void;
}>) {
  const convex = useConvex();
  const bringIn = useMutation(api.nowstaShiftHistory.bringIn);
  const createPerson = useCreatePerson();
  const [steps, setSteps] = useState<NowstaStep[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setSteps(null);
    setProblems([]);
    setBusy(true);
    try {
      let grid: string[][];
      try {
        grid = await sourceFileGrid(file);
      } catch {
        setError(
          `${file.name} could not be read. Use Nowsta's export as .csv or .xlsx.`,
        );
        return;
      }
      if (!isNowstaTimeAttendance(grid)) {
        setError(
          `${file.name} is not Nowsta's Time & Attendance export. It needs the headings Date, Event Name, First Name and Scheduled In.`,
        );
        return;
      }
      const read = readNowstaShifts(grid);
      const matches: NowstaRowMatch[] = [];
      for (let start = 0; start < read.rows.length; start += MATCH_ROWS) {
        const part = await convex.query(api.nowstaShiftHistory.match, {
          rows: read.rows.slice(start, start + MATCH_ROWS).map((row) => ({
            externalId: row.externalId,
            dayStart: row.dayStart,
            dayEnd: row.dayEnd,
            eventName: row.eventName,
          })),
        });
        if (part === null) {
          setError(
            "Only people who schedule shifts can bring in Nowsta shifts.",
          );
          return;
        }
        matches.push(...part);
      }
      setProblems(
        read.problems.map(({ line, reason }) => `Line ${line}: ${reason}`),
      );
      setSteps(planNowstaShifts(read.rows, people, matches, Date.now()));
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : `${file.name} could not be read.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!steps) return;
    setBusy(true);
    setError(null);
    let saved = 0;
    let added = 0;
    // One new person per email, however many shifts they have in the file.
    const madePeople = new Map<string, string>();
    try {
      for (const step of steps) {
        if (step.kind !== "save") continue;
        const { row } = step;
        let personId = step.personId ?? madePeople.get(row.email ?? "");
        if (!personId) {
          const created = await createPerson({
            givenName: row.givenName,
            familyName: row.familyName,
            email: row.email!,
            role: "staff",
            ...(row.phone ? { phone: row.phone } : {}),
          });
          personId = String(created.docId);
          madePeople.set(row.email!, personId);
          added += 1;
        }
        const result = await bringIn({
          externalId: row.externalId,
          personId,
          eventId: step.eventId,
          role: row.position,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          ...(row.actualStartsAt != null && row.actualEndsAt != null
            ? {
                actualStartsAt: row.actualStartsAt,
                actualEndsAt: row.actualEndsAt,
              }
            : {}),
          rawSourceData: JSON.stringify({
            line: row.line,
            date: row.date,
            eventName: row.eventName,
            name: `${row.givenName} ${row.familyName}`.trim(),
            position: row.position,
            ...row.kept,
          }),
        });
        if (!result.already) saved += 1;
      }
      setSteps(null);
      setProblems([]);
      onSaved(
        `Nowsta shifts saved: ${formatCountNoun(saved, "past shift")} brought in${
          added > 0
            ? `, ${formatCountNoun(added, "person", "people")} added to the team as Staff`
            : ""
        }. They show on the Roster in their week.`,
      );
    } catch (cause: unknown) {
      const reason =
        cause instanceof Error ? cause.message : "The shifts were not saved.";
      setError(
        saved + added > 0
          ? `${reason} The ones saved before it stopped are kept; read the file again to finish.`
          : reason,
      );
    } finally {
      setBusy(false);
    }
  };

  const toSave = steps?.filter((step) => step.kind === "save").length ?? 0;

  return (
    <details
      className="border-b border-line p-4 text-sm"
      data-testid="nowsta-shift-import"
    >
      <summary className="cursor-pointer font-semibold text-ink-2">
        Bring in past shifts from Nowsta
      </summary>
      <div className="mt-2 max-w-3xl space-y-3">
        <p className="text-ink-2">
          Use Nowsta&apos;s Time &amp; Attendance export (.csv or .xlsx). Each
          shift that is over is saved as a finished shift under its worker and
          its event, with the planned times and, when Nowsta has them, the
          worked times. A worker who is not on the team yet is added as Staff
          with their email and phone; nobody is emailed. Pay and billing figures
          stay in Nowsta, and no hours go to the time sheet or payroll.
        </p>
        <label className="field-label max-w-full min-w-0">
          Nowsta export file
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => void handleFile(event)}
            disabled={busy}
            className="max-w-full text-xs"
            data-testid="nowsta-shift-file"
          />
        </label>
        {busy && !steps ? (
          <p className="text-ink-2" role="status">
            Reading the file…
          </p>
        ) : null}
        {steps ? (
          <div className="space-y-2">
            <ul className="max-h-96 list-disc overflow-y-auto pl-5 text-ink-2">
              {steps.map((step) => (
                <li key={`${step.row.externalId}-${step.row.line}`}>
                  {stepText(step)}
                </li>
              ))}
              {problems.map((problem) => (
                <li key={problem}>{problem} Not brought in.</li>
              ))}
            </ul>
            {toSave > 0 ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy
                  ? "Saving…"
                  : `Save ${formatCountNoun(toSave, "past shift")}`}
              </button>
            ) : (
              <p className="text-ink-2" role="status">
                Nothing to save.
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
