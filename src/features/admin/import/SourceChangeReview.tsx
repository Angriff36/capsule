import { useMemo, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../lib/api";
import {
  useImportConflictSettle,
  useListImportConflict,
} from "../../../lib/manifest-convex-react";
import {
  DATASET_BY_RECORD_TYPE,
  SOURCE_FIELD_MAPS,
  describeValue,
  fieldLabel,
  fieldWritable,
  parseValues,
  readStoredValue,
} from "../../../../convex/lib/importSourceFields";

type Link = {
  _id: string;
  recordType: string;
  externalId: string;
  rawSourceData?: string | null;
};

function recordName(link: Link | undefined): string {
  if (!link) return "Unknown record";
  const kept = parseValues(link.rawSourceData) ?? {};
  if (typeof kept.name === "string") return kept.name;
  if (typeof kept.title === "string") return kept.title;
  const company = kept.company;
  if (
    company &&
    typeof company === "object" &&
    !Array.isArray(company) &&
    typeof company.name === "string"
  ) {
    return company.name;
  }
  const person = [kept.givenName, kept.familyName]
    .filter((part) => typeof part === "string" && part)
    .join(" ");
  return person || link.externalId;
}

/**
 * PL-SOURCE-DELTA (AC-273): a repeat import found a field changed both in the
 * old system and in Capsule. Both values stay visible here until a person
 * keeps Capsule's value or takes the new one; the import never overwrites a
 * person's edit by itself.
 */
export function SourceChangeReview({
  links,
  onDone,
  onError,
}: Readonly<{
  links: readonly Link[];
  onDone: (message: string) => void;
  onError: (message: string) => void;
}>) {
  const conflicts = useListImportConflict();
  const settle = useImportConflictSettle();
  const takeSource = useAction(api.importSourceDelta.takeSourceValue);
  const [busyId, setBusyId] = useState<string | null>(null);

  const linkById = useMemo(
    () => new Map(links.map((link) => [String(link._id), link])),
    [links],
  );
  const waiting = (conflicts ?? []).filter(
    (row) => row.status === "pending" && row.deletedAt == null,
  );
  if (waiting.length === 0) return null;

  async function run(id: string, work: () => Promise<unknown>, done: string) {
    setBusyId(id);
    try {
      await work();
      onDone(done);
    } catch (cause: unknown) {
      onError(cause instanceof Error ? cause.message : "Couldn't save that.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card mt-4">
      <div className="border-b border-line px-3">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
          Changed in the old system and in Capsule
        </h2>
      </div>
      <p className="px-4 pt-3 text-xs text-ink-2 max-w-160">
        A new import changed something that someone had already changed in
        Capsule. Capsule kept its own value. Pick which one is right.
      </p>
      <ul className="divide-y divide-line">
        {waiting.map((row) => {
          const link = linkById.get(String(row.externalRecordLinkId));
          const dataset = link
            ? DATASET_BY_RECORD_TYPE[link.recordType]
            : undefined;
          const map = dataset ? SOURCE_FIELD_MAPS[dataset] : undefined;
          const label = map ? fieldLabel(map, row.field) : row.field;
          const canTake = map
            ? fieldWritable(map, row.field, readStoredValue(row.sourceValue))
            : false;
          const busy = busyId === row._id;
          return (
            <li
              key={row._id}
              className="px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
            >
              <span className="font-medium">
                {recordName(link)} · {label}
              </span>
              <span>
                <span className="text-ink-3">In Capsule now: </span>
                {describeValue(row.field, readStoredValue(row.capsuleValue))}
              </span>
              <span>
                <span className="text-ink-3">New from old system: </span>
                {describeValue(row.field, readStoredValue(row.sourceValue))}
              </span>
              <span className="text-ink-3">
                Was{" "}
                {describeValue(row.field, readStoredValue(row.appliedValue))}
              </span>
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busyId != null}
                  onClick={() =>
                    run(
                      row._id,
                      () =>
                        settle({
                          docId: row._id,
                          version: row.version,
                          resolution: "keep_capsule",
                        }),
                      `Kept the Capsule ${label.toLowerCase()}.`,
                    )
                  }
                >
                  Keep Capsule value
                </button>
                {canTake ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busyId != null}
                    onClick={() =>
                      run(
                        row._id,
                        () => takeSource({ conflictId: row._id as never }),
                        `Used the new ${label.toLowerCase()}.`,
                      )
                    }
                  >
                    {busy ? "Saving…" : "Use new value"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busyId != null}
                    title={`Change the ${label.toLowerCase()} on the record first.`}
                    onClick={() =>
                      run(
                        row._id,
                        () =>
                          settle({
                            docId: row._id,
                            version: row.version,
                            resolution: "manual",
                          }),
                        `Marked the ${label.toLowerCase()} as fixed by hand.`,
                      )
                    }
                  >
                    Fixed on the record
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
