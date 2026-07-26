import { useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useCreateVenueLayoutTemplate,
  useListVenue,
  useListVenueLayoutTemplate,
  useVenueLayoutTemplateArchive,
  useVenueLayoutTemplateReactivate,
  useVenueLayoutTemplateRevise,
} from "../../lib/manifest-convex-react";
import {
  venueDetailPath,
  venueLayoutTemplatesListPath,
} from "./facilitiesRoutes";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import {
  classifyCommandFailure,
  type CommandFailure,
} from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";
import { BATTLE_BOARD_LAYOUT_TYPES } from "../events/battleBoardLayoutTypes";

// Mirrors EventLayoutSection's editable fields; stored as a JSON string on the
// template (sections) and copied verbatim into an event when applied.
type LayoutSection = {
  type: string;
  instructions: string | null;
  sortOrder: number;
};

// Generated list hooks return `any`; this named row type keeps the UI checked.
type VenueLayoutTemplateRow = {
  _id: string;
  venueId: string;
  name: string;
  description?: string | null;
  sections: string;
  status: "active" | "archived";
  version: number;
  definedAt?: number | null;
  deletedAt?: number | null;
};

const parseSections = (raw: string | null | undefined): LayoutSection[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is LayoutSection =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as LayoutSection).type === "string" &&
          typeof (s as LayoutSection).sortOrder === "number",
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  } catch {
    return [];
  }
};

type EditState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; docId: string; version: number };

/** Venue layout templates — reusable layout/logistics templates owned by a venue (spec §8.2). */
export function VenueLayoutTemplatesPage() {
  const { venueId } = useParams<{ venueId: string }>();
  const templates = useListVenueLayoutTemplate();
  const venues = useListVenue();

  const createTemplate = useCreateVenueLayoutTemplate();
  const reviseTemplate = useVenueLayoutTemplateRevise();
  const archiveTemplate = useVenueLayoutTemplateArchive();
  const reactivateTemplate = useVenueLayoutTemplateReactivate();

  const [edit, setEdit] = useState<EditState>({ mode: "closed" });
  const [formVenueId, setFormVenueId] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState<LayoutSection[]>([]);
  // Tracks whether the user touched the sections editor this session, so an
  // edit that only changes name/description never overwrites stored sections
  // (prevents clobbering data the UI can't parse — see parseSections).
  const [sectionsDirty, setSectionsDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);

  const venueName = (id: string | null | undefined) =>
    (venues ?? []).find((v) => v._id === id && v.deletedAt == null)?.name ??
    "—";

  const rows = useMemo(
    () =>
      (templates ?? [])
        .filter(
          (t) => t.deletedAt == null && (!venueId || t.venueId === venueId),
        )
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) ||
            Number(a.definedAt ?? 0) - Number(b.definedAt ?? 0),
        ),
    [templates, venueId],
  );

  const resetForm = () => {
    setEdit({ mode: "closed" });
    setName("");
    setDescription("");
    setSections([]);
    setSectionsDirty(false);
    setFormVenueId("");
  };

  const openCreate = () => {
    setFailure(null);
    setEdit({ mode: "create" });
    setFormVenueId(venueId ?? "");
    setName("");
    setDescription("");
    setSections([]);
    setSectionsDirty(false);
  };

  const openEdit = (template: VenueLayoutTemplateRow) => {
    if (!template) return;
    setFailure(null);
    setEdit({ mode: "edit", docId: template._id, version: template.version });
    setFormVenueId(template.venueId);
    setName(template.name);
    setDescription(template.description ?? "");
    setSections(parseSections(template.sections));
    setSectionsDirty(false);
  };

  const run = async (key: string, work: () => Promise<void>) => {
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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      alert("Template name is required");
      return;
    }
    const targetVenueId = formVenueId.trim();
    if (!targetVenueId) {
      alert("Venue is required");
      return;
    }
    const sectionsJson = JSON.stringify(sections);

    void run("save", async () => {
      if (edit.mode === "edit") {
        await reviseTemplate({
          docId: edit.docId,
          version: edit.version,
          name: trimmed,
          description: description.trim() || undefined,
          // Only send sections when the user actually edited them, so an
          // edit-to-fix-the-name never overwrites stored sections the UI
          // couldn't render (e.g. malformed JSON from another writer).
          sections: sectionsDirty ? sectionsJson : undefined,
        });
      } else {
        await createTemplate({
          venueId: targetVenueId,
          name: trimmed,
          description: description.trim() || undefined,
          sections: sectionsJson,
        });
      }
      resetForm();
    });
  };

  const addSection = () => {
    setSectionsDirty(true);
    setSections((prev) => [
      ...prev,
      { type: "Buffet", instructions: "", sortOrder: prev.length },
    ]);
  };

  const updateSection = (index: number, patch: Partial<LayoutSection>) => {
    setSectionsDirty(true);
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  };

  const removeSection = (index: number) => {
    setSectionsDirty(true);
    setSections((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, sortOrder: i })),
    );
  };

  const formOpen = edit.mode !== "closed";
  const loading = templates === undefined || venues === undefined;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-1">Layout Templates</h1>
          <p className="text-[13px] text-ink-3">
            {venueId ? (
              <>
                Reusable layouts for{" "}
                <Link className="link" to={venueDetailPath(venueId)}>
                  {venueName(venueId)}
                </Link>
                .
              </>
            ) : (
              <>Reusable venue layouts an event can copy into its setup.</>
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary min-h-10"
          disabled={busy != null}
          onClick={formOpen ? resetForm : openCreate}
        >
          {formOpen ? "Close" : "+ New template"}
        </button>
      </div>

      {failure ? <FailureBanner failure={failure} /> : null}

      {formOpen ? (
        <form
          className="mb-6 rounded-lg border border-line-2 bg-surface-1 p-4"
          onSubmit={submit}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="field-label">
              <span>Venue</span>
              {venueId ? (
                <input className="input" value={venueName(venueId)} readOnly />
              ) : (
                <select
                  className="input"
                  value={formVenueId}
                  onChange={(e) => setFormVenueId(e.target.value)}
                  disabled={busy != null}
                >
                  <option value="">Select a venue…</option>
                  {(venues ?? [])
                    .filter((v) => v.deletedAt == null)
                    .map((v) => (
                      <option key={v._id} value={v._id}>
                        {v.name}
                      </option>
                    ))}
                </select>
              )}
            </label>
            <label className="field-label">
              <span>Template name</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard wedding layout"
                disabled={busy != null}
              />
            </label>
          </div>

          <label className="field-label mt-3 block">
            <span>Description</span>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about when to use this layout"
              disabled={busy != null}
            />
          </label>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="field-label-text">
                Sections ({sections.length})
              </span>
              <button
                type="button"
                className="btn btn-ghost min-h-10"
                disabled={busy != null}
                onClick={addSection}
              >
                + Add section
              </button>
            </div>
            {sections.length === 0 ? (
              <p className="text-[13px] text-ink-3">
                No sections yet. Add Buffet, Bar, Parking, or another area.
              </p>
            ) : (
              <div className="mt-2 grid gap-2">
                {sections.map((section, index) => (
                  <div
                    key={index}
                    className="grid gap-2 rounded-md border border-line-2 p-2 md:grid-cols-[10rem_1fr_auto]"
                  >
                    <select
                      className="input"
                      value={
                        BATTLE_BOARD_LAYOUT_TYPES.includes(
                          section.type as (typeof BATTLE_BOARD_LAYOUT_TYPES)[number],
                        )
                          ? section.type
                          : ""
                      }
                      disabled={busy != null}
                      onChange={(e) =>
                        updateSection(index, { type: e.target.value })
                      }
                    >
                      {!BATTLE_BOARD_LAYOUT_TYPES.includes(
                        section.type as (typeof BATTLE_BOARD_LAYOUT_TYPES)[number],
                      ) ? (
                        <option value="">{section.type}</option>
                      ) : null}
                      {BATTLE_BOARD_LAYOUT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      value={section.instructions ?? ""}
                      placeholder="Setup instructions, equipment, positioning…"
                      disabled={busy != null}
                      onChange={(e) =>
                        updateSection(index, {
                          instructions: e.target.value || null,
                        })
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-ghost min-h-10"
                      disabled={busy != null}
                      onClick={() => removeSection(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="submit"
              className="btn btn-primary min-h-10"
              disabled={busy != null}
            >
              {edit.mode === "edit" ? "Save changes" : "Create template"}
            </button>
            <button
              type="button"
              className="btn btn-ghost min-h-10"
              disabled={busy != null}
              onClick={resetForm}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-ink-3">
          No layout templates yet.{" "}
          {venueId ? (
            <Link className="link" to={venueLayoutTemplatesListPath(venueId)}>
              Create one for this venue.
            </Link>
          ) : null}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[12px] uppercase text-ink-3">
              <tr>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Venue</th>
                <th className="py-2 pr-3">Sections</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((template) => {
                const count = parseSections(template.sections).length;
                return (
                  <tr key={template._id} className="border-t border-line-2">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-ink-1">
                        {template.name}
                      </div>
                      {template.description ? (
                        <div className="text-[12px] text-ink-3">
                          {template.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-ink-2">
                      <Link
                        className="link"
                        to={venueDetailPath(template.venueId)}
                      >
                        {venueName(template.venueId)}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-ink-2">{count}</td>
                    <td className="py-2 pr-3">
                      <StatusChip
                        status={template.status}
                        color={
                          template.status === "active"
                            ? "border-ok/30 bg-ok-soft text-ok"
                            : "border-line-2 bg-inset text-ink-3"
                        }
                      >
                        {template.status === "active" ? "Active" : "Archived"}
                      </StatusChip>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-ghost min-h-10"
                          disabled={
                            busy != null || template.status !== "active"
                          }
                          onClick={() => openEdit(template)}
                        >
                          Edit
                        </button>
                        {template.status === "active" ? (
                          <button
                            type="button"
                            className="btn btn-ghost min-h-10"
                            disabled={busy != null}
                            onClick={() => {
                              // Reason is optional (archiving is reversible);
                              // cancel the prompt to archive without one.
                              const reason = window.prompt(
                                "Archive reason (optional)",
                              );
                              if (reason == null) return;
                              const trimmed = reason.trim();
                              void run(`archive:${template._id}`, () =>
                                archiveTemplate({
                                  docId: template._id,
                                  version: template.version,
                                  reason: trimmed || undefined,
                                }),
                              );
                            }}
                          >
                            Archive
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost min-h-10"
                            disabled={busy != null}
                            onClick={() =>
                              void run(`reactivate:${template._id}`, () =>
                                reactivateTemplate({
                                  docId: template._id,
                                  version: template.version,
                                }),
                              )
                            }
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
