import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateServiceStyleKitItem,
  useListServiceStyle,
  useListServiceStyleKitItem,
  useServiceStyleKitItemReinstate,
  useServiceStyleKitItemRetire,
  useServiceStyleKitItemRevise,
} from "../../lib/manifest-convex-react";
import { PageHeader, TableSkeleton } from "../../ui/primitives";
import { classifyCommandFailure } from "../events/CommandFailure";
import { LogisticsFailureBanner } from "./LogisticsFailureBanner";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";
import {
  EMPTY_KIT_LINE_DRAFT as EMPTY_DRAFT,
  ServiceStyleKitLineFields,
  type KitLineDraft as LineDraft,
} from "./ServiceStyleKitLineFields";
import {
  ServiceStyleKitLineTable,
  type KitLine,
} from "./ServiceStyleKitLineTable";

function wholeNumber(raw: string): number | undefined {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isFinite(value)
    ? Math.round(value)
    : undefined;
}

/**
 * The default kit for each service style. Every new event of a style gets
 * these lines on its pack list; the packer can then change that one event's
 * list without touching the kit.
 */
export function ServiceStyleKitsPage() {
  const serviceStyles = useListServiceStyle();
  const kitLines = useListServiceStyleKitItem() as KitLine[] | undefined;
  const addLine = useCreateServiceStyleKitItem();
  const reviseLine = useServiceStyleKitItemRevise();
  const retireLine = useServiceStyleKitItemRetire();
  const reinstateLine = useServiceStyleKitItemReinstate();
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [editing, setEditing] = useState<{
    id: string;
    draft: LineDraft;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const run = async (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  const styles = (serviceStyles ?? [])
    .filter((style) => style.deletedAt == null && style.status === "active")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const linesFor = (styleId: string) =>
    (kitLines ?? [])
      .filter(
        (line) => line.deletedAt == null && line.serviceStyleId === styleId,
      )
      .sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          a.description.localeCompare(b.description),
      );

  const draftFor = (styleId: string) => drafts[styleId] ?? EMPTY_DRAFT;
  const setDraft = (styleId: string, patch: Partial<LineDraft>) =>
    setDrafts((all) => ({
      ...all,
      [styleId]: { ...draftFor(styleId), ...patch },
    }));

  const submitAdd = (styleId: string, domEvent: FormEvent) => {
    domEvent.preventDefault();
    const draft = draftFor(styleId);
    if (!draft.description.trim()) return;
    void run(`add:${styleId}`, async () => {
      await addLine({
        serviceStyleId: styleId,
        description: draft.description.trim(),
        baseQuantity: wholeNumber(draft.baseQuantity) ?? 0,
        guestsPerUnit: wholeNumber(draft.guestsPerUnit),
        unit: draft.unit,
        note: draft.note.trim() || undefined,
        sortOrder: linesFor(styleId).length,
      });
      setDrafts((all) => ({ ...all, [styleId]: EMPTY_DRAFT }));
    });
  };

  // Swap two neighbours. revise() clears an omitted optional value, so every
  // saved value goes back with it.
  const move = (lines: KitLine[], index: number, step: -1 | 1) => {
    const line = lines[index];
    const other = lines[index + step];
    if (!line || !other) return;
    const place = (target: KitLine, sortOrder: number) =>
      reviseLine({
        docId: target._id,
        version: target.version,
        description: target.description,
        baseQuantity: target.baseQuantity,
        guestsPerUnit: target.guestsPerUnit ?? undefined,
        unit: target.unit,
        note: target.note ?? undefined,
        sortOrder,
      });
    void run(`move:${line._id}`, async () => {
      // Positions, not the saved numbers: old lines can share a sort order.
      await place(line, index + step);
      await place(other, index);
    });
  };

  const submitEdit = (line: KitLine, domEvent: FormEvent) => {
    domEvent.preventDefault();
    if (!editing || !editing.draft.description.trim()) return;
    const draft = editing.draft;
    void run(`edit:${line._id}`, async () => {
      await reviseLine({
        docId: line._id,
        version: line.version,
        description: draft.description.trim(),
        baseQuantity: wholeNumber(draft.baseQuantity) ?? 0,
        guestsPerUnit: wholeNumber(draft.guestsPerUnit),
        unit: draft.unit,
        note: draft.note.trim() || undefined,
      });
      setEditing(null);
    });
  };

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Service style kits"
        lead={
          <>
            The default kit that goes with every event of a service style. A new
            event gets these lines on its{" "}
            <Link className="link" to="/logistics/packs">
              pack list
            </Link>{" "}
            automatically. Change one event on its own load sheet.
          </>
        }
      />
      <LogisticsWorkspaceNav />
      {failure ? <LogisticsFailureBanner error={failure} /> : null}

      {serviceStyles === undefined || kitLines === undefined ? (
        <TableSkeleton rows={5} />
      ) : styles.length === 0 ? (
        <div className="document-empty">
          <p>No active service styles.</p>
          <span>
            Add service styles in{" "}
            <Link className="link" to="/admin/catalogs">
              Admin → Catalogs
            </Link>
            .
          </span>
        </div>
      ) : (
        <>
          <nav className="fact-row mt-4" aria-label="Jump to a service style">
            {styles.map((style) => (
              <a key={style._id} className="fact" href={`#kit-${style._id}`}>
                <b>{style.name}:</b>
                {
                  linesFor(style._id).filter(
                    (line) => String(line.status) === "active",
                  ).length
                }
              </a>
            ))}
          </nav>
          {styles.map((style) => {
            const lines = linesFor(style._id);
            const draft = draftFor(style._id);
            return (
              <section
                key={style._id}
                id={`kit-${style._id}`}
                className="mt-8 scroll-mt-16"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="font-display text-2xl text-ink">
                    {style.name}
                  </h2>
                  <span className="text-base text-ink-2">
                    {lines.filter((l) => String(l.status) === "active").length}{" "}
                    active lines
                  </span>
                </div>
                {lines.length > 0 ? (
                  <ServiceStyleKitLineTable
                    lines={lines}
                    busy={busy}
                    onMove={(index, step) => move(lines, index, step)}
                    onEdit={(line) =>
                      setEditing({
                        id: line._id,
                        draft: {
                          description: line.description,
                          baseQuantity: String(line.baseQuantity),
                          guestsPerUnit:
                            line.guestsPerUnit != null
                              ? String(line.guestsPerUnit)
                              : "",
                          unit: line.unit,
                          note: line.note ?? "",
                        },
                      })
                    }
                    onRetire={(line) =>
                      void run(`retire:${line._id}`, () =>
                        retireLine({ docId: line._id, version: line.version }),
                      )
                    }
                    onReinstate={(line) =>
                      void run(`reinstate:${line._id}`, () =>
                        reinstateLine({
                          docId: line._id,
                          version: line.version,
                        }),
                      )
                    }
                  />
                ) : (
                  <p className="mt-3 text-base text-ink-2">
                    No kit lines. Events of this style start with an empty pack
                    list.
                  </p>
                )}

                {editing && lines.some((line) => line._id === editing.id) ? (
                  <form
                    className="mt-3 rounded-sm border border-line-2 bg-panel p-4"
                    onSubmit={(e) =>
                      submitEdit(
                        lines.find(
                          (line) => line._id === editing.id,
                        ) as KitLine,
                        e,
                      )
                    }
                  >
                    <p className="eyebrow">Edit kit line</p>
                    <div className="mt-2 grid gap-3 md:grid-cols-4">
                      <ServiceStyleKitLineFields
                        draft={editing.draft}
                        disabled={busy != null}
                        onChange={(patch) =>
                          setEditing({
                            id: editing.id,
                            draft: { ...editing.draft, ...patch },
                          })
                        }
                      />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={busy != null}
                      >
                        {busy === `edit:${editing.id}`
                          ? "Saving…"
                          : "Save line"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}

                <form
                  className="mt-3 rounded-sm border border-line-2 bg-panel p-4"
                  onSubmit={(e) => submitAdd(style._id, e)}
                >
                  <p className="eyebrow">Add to the {style.name} kit</p>
                  <div className="mt-2 grid gap-3 md:grid-cols-4">
                    <ServiceStyleKitLineFields
                      draft={draft}
                      disabled={busy != null}
                      onChange={(patch) => setDraft(style._id, patch)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm mt-3"
                    disabled={busy != null || !draft.description.trim()}
                  >
                    {busy === `add:${style._id}` ? "Adding…" : "Add kit line"}
                  </button>
                </form>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
