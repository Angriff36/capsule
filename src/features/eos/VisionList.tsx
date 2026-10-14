import { useState, type FormEvent } from "react";
import {
  useCreateVisionItem,
  useVisionItemMarkDone,
  useVisionItemMarkNotDone,
  useVisionItemRemove,
  useVisionItemRevise,
} from "@/lib/manifest-convex-react";
import type { Doc } from "../../lib/api";
import { InlineText } from "./EosShared";
import type { VisionItemSection } from "./eosModel";

type Item = Doc<"visionItems">;
type Run = (work: () => Promise<unknown>) => Promise<boolean>;

/**
 * One list on the V/TO (core values, the three uniques, the 3-year picture,
 * the 1-year goals): numbered rows you edit in place, move up or down, tick
 * off (goals) or remove, and a one-line box to add the next one.
 */
export function VisionList({
  section,
  items,
  canEdit,
  run,
  busy,
  placeholder,
  detailPlaceholder,
  checkable = false,
  limitHint,
}: {
  section: VisionItemSection;
  items: readonly Item[];
  canEdit: boolean;
  run: Run;
  busy: boolean;
  placeholder: string;
  detailPlaceholder?: string;
  checkable?: boolean;
  limitHint?: string;
}) {
  const add = useCreateVisionItem();
  const revise = useVisionItemRevise();
  const remove = useVisionItemRemove();
  const markDone = useVisionItemMarkDone();
  const markNotDone = useVisionItemMarkNotDone();
  const [draft, setDraft] = useState("");
  const rows = items
    .filter((row) => row.section === section)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const save = (row: Item, text: string, detail: string | undefined) =>
    run(() =>
      revise({
        docId: row._id,
        version: row.version,
        text,
        detail: detail || undefined,
        sortOrder: row.sortOrder,
      }),
    );

  const swap = (index: number, delta: number) => {
    const a = rows[index];
    const b = rows[index + delta];
    if (!a || !b) return;
    void run(async () => {
      await revise({
        docId: a._id,
        version: a.version,
        text: a.text,
        detail: a.detail ?? undefined,
        sortOrder:
          b.sortOrder === a.sortOrder ? a.sortOrder + delta : b.sortOrder,
      });
      await revise({
        docId: b._id,
        version: b.version,
        text: b.text,
        detail: b.detail ?? undefined,
        sortOrder: a.sortOrder,
      });
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const sortOrder =
      rows.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 1;
    void run(() => add({ section, text, sortOrder })).then((ok) => {
      if (ok) setDraft("");
    });
  };

  return (
    <div>
      {rows.length === 0 && !canEdit ? (
        <p className="text-sm text-ink-3">Not written yet.</p>
      ) : null}
      <ol className="eos-list">
        {rows.map((row, index) => (
          <li
            key={row._id}
            className={`eos-list-row${row.doneAt != null ? " is-done" : ""}`}
          >
            {checkable ? (
              <input
                type="checkbox"
                className="mt-2 size-4 accent-current"
                aria-label={`Done: ${row.text}`}
                checked={row.doneAt != null}
                disabled={!canEdit || busy}
                onChange={() =>
                  void run(() =>
                    row.doneAt != null
                      ? markNotDone({ docId: row._id, version: row.version })
                      : markDone({ docId: row._id, version: row.version }),
                  )
                }
              />
            ) : (
              <span className="eos-list-index">{index + 1}</span>
            )}
            <div className="min-w-0">
              <InlineText
                value={row.text}
                label={placeholder}
                placeholder={placeholder}
                disabled={!canEdit}
                onSave={(text) =>
                  text ? save(row, text, row.detail ?? undefined) : undefined
                }
              />
              {detailPlaceholder && (row.detail || canEdit) ? (
                <div className="text-sm text-ink-2">
                  <InlineText
                    value={row.detail ?? ""}
                    label={detailPlaceholder}
                    placeholder={detailPlaceholder}
                    disabled={!canEdit}
                    onSave={(detail) => save(row, row.text, detail)}
                  />
                </div>
              ) : null}
            </div>
            {canEdit ? (
              <div className="eos-row-tools">
                <button
                  type="button"
                  className="eos-icon-btn"
                  aria-label={`Move up: ${row.text}`}
                  disabled={busy || index === 0}
                  onClick={() => swap(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="eos-icon-btn"
                  aria-label={`Move down: ${row.text}`}
                  disabled={busy || index === rows.length - 1}
                  onClick={() => swap(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="eos-icon-btn"
                  aria-label={`Remove: ${row.text}`}
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      remove({ docId: row._id, version: row.version }),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ol>
      {canEdit ? (
        <form className="eos-add" onSubmit={submit}>
          <input
            className="input"
            aria-label={`Add: ${placeholder}`}
            placeholder={`Add ${placeholder.toLowerCase()}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            className="btn btn-secondary"
            disabled={busy || !draft.trim()}
          >
            Add
          </button>
        </form>
      ) : null}
      {limitHint ? (
        <p className="mt-1 text-xs text-ink-3">{limitHint}</p>
      ) : null}
    </div>
  );
}
