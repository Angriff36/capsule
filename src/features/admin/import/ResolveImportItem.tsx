import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "../../../lib/api";
import { convexActionErrorMessage } from "../../../lib/convexActionErrorMessage";
import {
  ADDABLE_RECORD_TYPES,
  CHOOSABLE_RECORD_TYPES,
} from "../../../../convex/lib/importResolution";

/**
 * PL-SOURCE-RESOLUTION (AC-059): settle one import item beside its old-system
 * row. Pick a record Capsule already has, or add a new one of the right kind.
 * The choice is kept for every later import of the same row.
 */
export function ResolveImportItem({
  link,
  disabled,
  onDone,
  onError,
}: Readonly<{
  link: { _id: string; recordType: string; capsuleId: string };
  disabled: boolean;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}>) {
  const [picking, setPicking] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const linkId = link._id as Id<"externalRecordLinks">;
  const found = useQuery(
    api.importResolution.findRecordsForItem,
    picking && text.trim().length >= 2 ? { linkId, text } : "skip",
  );
  const choose = useMutation(api.importResolution.chooseExistingRecord);
  const add = useMutation(api.importResolution.addRecordForItem);

  if (!CHOOSABLE_RECORD_TYPES.has(link.recordType)) {
    return <span className="text-ink-3">—</span>;
  }
  const canAdd = !link.capsuleId && ADDABLE_RECORD_TYPES.has(link.recordType);
  const isClient =
    link.recordType === "contact" || link.recordType === "company";
  const off = disabled || busy;

  function run(work: Promise<string>, fallback: string) {
    setBusy(true);
    void work
      .then((message) => {
        setPicking(false);
        setText("");
        onDone(message);
      })
      .catch((cause: unknown) =>
        onError(convexActionErrorMessage(cause, fallback)),
      )
      .finally(() => setBusy(false));
  }

  function addAs(clientType?: "person" | "company") {
    run(
      add({ linkId, ...(clientType ? { clientType } : {}) }).then(
        ({ label }) => `Added ${label}. Later imports of this row use it.`,
      ),
      "Couldn't add that record.",
    );
  }

  return (
    <div className="flex max-w-80 flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={off}
          aria-expanded={picking}
          onClick={() => setPicking((open) => !open)}
        >
          Pick existing
        </button>
        {canAdd && isClient ? (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={off}
              onClick={() => addAs("person")}
            >
              Add as a person
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={off}
              onClick={() => addAs("company")}
            >
              Add as a company
            </button>
          </>
        ) : canAdd ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={off}
            onClick={() => addAs()}
          >
            Add as new
          </button>
        ) : null}
      </div>
      {picking ? (
        <div className="flex flex-col gap-1">
          <input
            type="search"
            name="recordSearch"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a name"
            aria-label="Find the record in Capsule"
            className="px-2 py-1 border border-line-2 rounded-sm text-2xs"
            disabled={off}
          />
          {text.trim().length >= 2 && found !== undefined ? (
            found.length === 0 ? (
              <p className="text-2xs text-ink-3">Nothing by that name.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {found.map((record) => (
                  <li key={record.id}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm w-full justify-start"
                      disabled={off}
                      onClick={() =>
                        run(
                          choose({ linkId, recordId: record.id }).then(
                            ({ label, leftBehind }) =>
                              `Matched to ${label}. Later imports of this row use it.` +
                              (leftBehind
                                ? ` ${leftBehind}, which the import added, is still in Capsule; merge or archive it if it is the same.`
                                : ""),
                          ),
                          "Couldn't match that record.",
                        )
                      }
                    >
                      {record.label}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
