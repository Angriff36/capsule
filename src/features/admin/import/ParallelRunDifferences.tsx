// PL-CUTOVER (AC-286): every difference the daily TPP comparison found.
// Each row opens the TPP record (its import) and the Capsule event, can be
// given to a person, and settled as "one system was fixed" or "the
// difference is fine". A whole kind (for example every stage difference
// while TPP keeps its own stages) can be marked fine at once, with a reason.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "convex/react";
import { api } from "@/lib/api";
import {
  useListPerson,
  useParallelRunDifferenceAssign,
  useParallelRunDifferenceReopen,
  useParallelRunDifferenceSettle,
} from "@/lib/manifest-convex-react";
import { formatCountNoun } from "@/lib/format";
import {
  DIFFERENCE_FIELD_WORDS,
  type DifferenceField,
} from "@/lib/parallelRunCompare";
import type { ParallelRunDifferenceRow } from "../../../../convex/parallelRun";
import { StatusChip } from "../../../ui/primitives";
import { useActionPrompt } from "../../../ui/action-prompt";
import { useActionFailure, useActionNotice } from "../../../ui/action-result";
import { classifyCommandFailure } from "../../events/CommandFailure";
import { FailureBanner } from "../../events/FailureBanner";
import { eventDetailPath } from "../../events/eventRoutes";
import { importRunDetailPath, reconcilePath } from "./importRoutes";

const STATUS_WORDS: Record<ParallelRunDifferenceRow["status"], string> = {
  open: "To check",
  fixed: "Fixed",
  accepted: "Fine as is",
  cleared: "Agrees now",
};

function fieldWords(field: string): string {
  return DIFFERENCE_FIELD_WORDS[field as DifferenceField] ?? field;
}

export function ParallelRunDifferences({
  differences,
  total,
}: {
  differences: ParallelRunDifferenceRow[];
  total: number;
}) {
  const people = useListPerson();
  const assign = useParallelRunDifferenceAssign();
  const settle = useParallelRunDifferenceSettle();
  const reopen = useParallelRunDifferenceReopen();
  const acceptAll = useMutation(api.parallelRun.acceptAllOfField);
  const { prompt, host } = useActionPrompt();
  const { error, setError } = useActionFailure();
  const { notice, setNotice } = useActionNotice();
  const [field, setField] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const fields = useMemo(
    () => [...new Set(differences.map((row) => row.field))].sort(),
    [differences],
  );
  const shown = field
    ? differences.filter((row) => row.field === field)
    : differences;
  const openOfField = differences.filter(
    (row) => row.field === field && row.status === "open",
  ).length;
  const activePeople = (people ?? []).filter(
    (person) => person.deletedAt == null,
  );

  const run = async (
    id: string,
    step: () => Promise<unknown>,
    done: string,
  ) => {
    setBusyId(id);
    setError(null);
    try {
      await step();
      setNotice(done);
    } catch (err) {
      const failure = classifyCommandFailure(err);
      setError(`${failure.title}: ${failure.detail}`);
    } finally {
      setBusyId(null);
    }
  };

  const markFine = async (row: ParallelRunDifferenceRow) => {
    const note = await prompt.askReason({
      title: "The difference is fine",
      description: `Say why ${fieldWords(row.field).toLowerCase()} can stay different for TPP event ${row.externalId}.`,
      label: "Why it is fine",
      placeholder: "For example: TPP keeps the old value",
      confirmLabel: "Mark fine",
    });
    if (!note) return;
    await run(
      row.id,
      () =>
        settle({
          docId: row.id,
          version: row.version,
          resolution: "accepted",
          note,
        }),
      "Marked fine.",
    );
  };

  const markAllFine = async () => {
    const note = await prompt.askReason({
      title: `Every ${fieldWords(field).toLowerCase()} difference is fine`,
      description: `Marks ${formatCountNoun(openOfField, "open difference")} of this kind as fine.`,
      label: "Why they are fine",
      placeholder: "For example: TPP keeps its own stages",
      confirmLabel: "Mark all fine",
    });
    if (!note) return;
    await run(
      `all-${field}`,
      () => acceptAll({ field, note }),
      "Marked all fine.",
    );
  };

  return (
    <section className="working-ledger mt-6">
      {host}
      <div className="ledger-heading">
        <div>
          <h2>Differences to settle</h2>
          <p className="text-xs text-ink-2">
            Each day Capsule checks every TPP event against its Capsule event.
            Give each difference to a person, then say if one system was fixed
            or the difference is fine. Open ones hold up the switch from TPP.
          </p>
        </div>
        <span>{formatCountNoun(total, "difference")}</span>
      </div>
      {error ? (
        <FailureBanner failure={classifyCommandFailure(new Error(error))} />
      ) : notice ? (
        <p className="text-xs text-ok px-1">{notice}</p>
      ) : null}
      {fields.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-2">
          <label className="text-xs text-ink-2" htmlFor="difference-field">
            Show
          </label>
          <select
            id="difference-field"
            className="input input-sm"
            value={field}
            onChange={(event) => setField(event.target.value)}
          >
            <option value="">Every kind</option>
            {fields.map((value) => (
              <option key={value} value={value}>
                {fieldWords(value)}
              </option>
            ))}
          </select>
          {field && openOfField > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busyId != null}
              onClick={() => void markAllFine()}
            >
              Mark all {openOfField} fine
            </button>
          )}
        </div>
      )}
      <div className="supply-table-wrap">
        <table className="supply-table phone-cards">
          <thead>
            <tr>
              <th>TPP event</th>
              <th>What differs</th>
              <th>In TPP</th>
              <th>In Capsule</th>
              <th>Given to</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-ok">
                  ✓ TPP and Capsule agree
                </td>
              </tr>
            ) : (
              shown.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link
                      to={
                        row.importRunId
                          ? importRunDetailPath(row.importRunId)
                          : reconcilePath()
                      }
                      title="Open the TPP rows this event came from"
                      className="text-info"
                    >
                      {row.externalId}
                    </Link>
                    {row.tppTitle && (
                      <div className="text-2xs text-ink-3">{row.tppTitle}</div>
                    )}
                  </td>
                  <td data-label="What differs">{fieldWords(row.field)}</td>
                  <td data-label="In TPP">{row.sourceValue ?? "—"}</td>
                  <td data-label="In Capsule">
                    {row.eventId ? (
                      <Link
                        to={eventDetailPath(
                          row.eventId as `${string}/${string}`,
                        )}
                        className="text-info"
                        title={row.eventTitle ?? undefined}
                      >
                        {row.capsuleValue ?? "—"}
                      </Link>
                    ) : (
                      (row.capsuleValue ?? "—")
                    )}
                  </td>
                  <td data-label="Given to">
                    <select
                      aria-label={`Give TPP event ${row.externalId} ${fieldWords(row.field)} to`}
                      className="input input-sm"
                      value={row.assignedToPersonId ?? ""}
                      disabled={busyId != null}
                      onChange={(event) =>
                        void run(
                          row.id,
                          () =>
                            assign({
                              docId: row.id,
                              version: row.version,
                              assignedToPersonId:
                                event.target.value || undefined,
                            }),
                          "Given to a person.",
                        )
                      }
                    >
                      <option value="">Nobody yet</option>
                      {activePeople.map((person) => (
                        <option key={person._id} value={person._id}>
                          {`${person.givenName} ${person.familyName}`.trim()}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Status">
                    <StatusChip status={row.status} />
                    <span className="sr-only">{STATUS_WORDS[row.status]}</span>
                    {row.resolutionNote && (
                      <div className="text-2xs text-ink-3">
                        {row.resolutionNote}
                      </div>
                    )}
                  </td>
                  <td>
                    {row.status === "open" ? (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busyId != null}
                          onClick={() =>
                            void run(
                              row.id,
                              () =>
                                settle({
                                  docId: row.id,
                                  version: row.version,
                                  resolution: "fixed",
                                }),
                              "Marked fixed. Tomorrow's check confirms it.",
                            )
                          }
                        >
                          Fixed
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busyId != null}
                          onClick={() => void markFine(row)}
                        >
                          Fine as is
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busyId != null}
                        onClick={() =>
                          void run(
                            row.id,
                            () =>
                              reopen({ docId: row.id, version: row.version }),
                            "Opened again.",
                          )
                        }
                      >
                        Open again
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {total > differences.length && (
        <p className="mt-3 text-xs text-center text-ink-3">
          Showing {differences.length} of {total} differences
        </p>
      )}
    </section>
  );
}
