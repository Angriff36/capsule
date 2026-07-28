import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreatePackListTemplate,
  useListOccasion,
  useListPackListTemplate,
  useListServiceStyle,
  usePackListTemplateArchive,
  usePackListTemplateReactivate,
  usePackListTemplateRevise,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import {
  classifyCommandFailure,
  type CommandFailure,
} from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";
import { PACK_LIST_UNITS, type PackListUnit } from "./packListUnits";

// Mirrors PackListItem's editable equipment fields; stored as a JSON string on
// the template (items) and copied verbatim into an event's PackList when
// generated. dishId is intentionally omitted — spec §11.2 templates are
// equipment pack lists, not produced-culinary-output lines.
type PackTemplateItem = {
  description: string;
  requiredQuantity: number;
  unit: PackListUnit;
};

// Generated list hooks return `any`; this named row type keeps the UI checked.
type PackListTemplateRow = {
  _id: string;
  name: string;
  description?: string | null;
  items: string;
  status: "active" | "archived";
  version: number;
  serviceStyleId?: string | null;
  occasionId?: string | null;
  guestCountMin?: number | null;
  guestCountMax?: number | null;
  venueRequirement?: string | null;
  definedAt?: number | null;
  deletedAt?: number | null;
};

const parseItems = (raw: string | null | undefined): PackTemplateItem[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (it): it is PackTemplateItem =>
          typeof it === "object" &&
          it !== null &&
          typeof (it as PackTemplateItem).description === "string" &&
          typeof (it as PackTemplateItem).requiredQuantity === "number",
      )
      .map((it) => ({
        description: it.description,
        requiredQuantity: it.requiredQuantity,
        unit: PACK_LIST_UNITS.includes(it.unit) ? it.unit : "each",
      }));
  } catch {
    return [];
  }
};

const parseBand = (value: string): number | undefined => {
  if (value.trim() === "") return undefined;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : undefined;
};

type EditState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; docId: string; version: number };

/** Pack list templates — reusable equipment pack lists an event can generate from (spec §11.2). */
export function PackListTemplatesPage() {
  const templates = useListPackListTemplate();
  const serviceStyles = useListServiceStyle();
  const occasions = useListOccasion();

  const createTemplate = useCreatePackListTemplate();
  const reviseTemplate = usePackListTemplateRevise();
  const archiveTemplate = usePackListTemplateArchive();
  const reactivateTemplate = usePackListTemplateReactivate();

  const [edit, setEdit] = useState<EditState>({ mode: "closed" });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<PackTemplateItem[]>([]);
  // Tracks whether the user touched the items editor this session, so an edit
  // that only changes name/dimensions never overwrites stored items the UI
  // can't parse (prevents silent data loss — same posture as VenueLayoutTemplate).
  const [itemsDirty, setItemsDirty] = useState(false);
  const [serviceStyleId, setServiceStyleId] = useState("");
  const [occasionId, setOccasionId] = useState("");
  const [guestCountMin, setGuestCountMin] = useState("");
  const [guestCountMax, setGuestCountMax] = useState("");
  const [venueRequirement, setVenueRequirement] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);

  const styleName = (id: string | null | undefined) =>
    (serviceStyles ?? []).find((s) => s._id === id && s.deletedAt == null)
      ?.name ?? "—";
  const occasionName = (id: string | null | undefined) =>
    (occasions ?? []).find((o) => o._id === id && o.deletedAt == null)?.name ??
    "—";

  const rows = useMemo(
    () =>
      (templates ?? [])
        .filter((t) => t.deletedAt == null)
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) ||
            Number(a.definedAt ?? 0) - Number(b.definedAt ?? 0),
        ),
    [templates],
  );

  const resetForm = () => {
    setEdit({ mode: "closed" });
    setName("");
    setDescription("");
    setItems([]);
    setItemsDirty(false);
    setServiceStyleId("");
    setOccasionId("");
    setGuestCountMin("");
    setGuestCountMax("");
    setVenueRequirement("");
  };

  const openCreate = () => {
    setFailure(null);
    setEdit({ mode: "create" });
    setName("");
    setDescription("");
    setItems([]);
    setItemsDirty(false);
    setServiceStyleId("");
    setOccasionId("");
    setGuestCountMin("");
    setGuestCountMax("");
    setVenueRequirement("");
  };

  const openEdit = (template: PackListTemplateRow) => {
    if (!template) return;
    setFailure(null);
    setEdit({ mode: "edit", docId: template._id, version: template.version });
    setName(template.name);
    setDescription(template.description ?? "");
    setItems(parseItems(template.items));
    setItemsDirty(false);
    setServiceStyleId(template.serviceStyleId ?? "");
    setOccasionId(template.occasionId ?? "");
    setGuestCountMin(
      template.guestCountMin != null ? String(template.guestCountMin) : "",
    );
    setGuestCountMax(
      template.guestCountMax != null ? String(template.guestCountMax) : "",
    );
    setVenueRequirement(template.venueRequirement ?? "");
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
    const min = parseBand(guestCountMin);
    const max = parseBand(guestCountMax);
    if (min != null && max != null && max < min) {
      alert("Guest-count band max must be greater than or equal to min.");
      return;
    }
    const itemsJson = JSON.stringify(items);

    void run("save", async () => {
      if (edit.mode === "edit") {
        await reviseTemplate({
          docId: edit.docId,
          version: edit.version,
          name: trimmed,
          description: description.trim() || undefined,
          // Only send items when the user actually edited them, so an
          // edit-to-fix-the-name never overwrites stored items the UI couldn't
          // render (e.g. malformed JSON from another writer).
          items: itemsDirty ? itemsJson : undefined,
          serviceStyleId: serviceStyleId || undefined,
          occasionId: occasionId || undefined,
          guestCountMin: min,
          guestCountMax: max,
          venueRequirement: venueRequirement.trim() || undefined,
        });
      } else {
        await createTemplate({
          name: trimmed,
          description: description.trim() || undefined,
          items: itemsJson,
          serviceStyleId: serviceStyleId || undefined,
          occasionId: occasionId || undefined,
          guestCountMin: min,
          guestCountMax: max,
          venueRequirement: venueRequirement.trim() || undefined,
        });
      }
      resetForm();
    });
  };

  const addItem = () => {
    setItemsDirty(true);
    setItems((prev) => [
      ...prev,
      { description: "", requiredQuantity: 1, unit: "each" },
    ]);
  };

  const updateItem = (index: number, patch: Partial<PackTemplateItem>) => {
    setItemsDirty(true);
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    );
  };

  const removeItem = (index: number) => {
    setItemsDirty(true);
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const formOpen = edit.mode !== "closed";
  const loading = templates === undefined;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">
            Pack List Templates
          </h1>
          <p className="text-[13px] text-ink-3">
            Reusable equipment pack lists an event can generate into its load
            sheet.{" "}
            <Link className="link" to="/logistics/packs">
              Pack lists
            </Link>
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
          className="mb-6 rounded-lg border border-line-2 bg-panel p-4"
          onSubmit={submit}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="field-label">
              <span>Template name</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard buffet — 100 guests"
                disabled={busy != null}
              />
            </label>
            <label className="field-label">
              <span>Service style (optional)</span>
              <select
                className="input"
                value={serviceStyleId}
                onChange={(e) => setServiceStyleId(e.target.value)}
                disabled={busy != null}
              >
                <option value="">Any service style</option>
                {(serviceStyles ?? [])
                  .filter((s) => s.deletedAt == null)
                  .map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <label className="field-label mt-3 block">
            <span>Description</span>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about when to use this template"
              disabled={busy != null}
            />
          </label>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="field-label">
              <span>Occasion (optional)</span>
              <select
                className="input"
                value={occasionId}
                onChange={(e) => setOccasionId(e.target.value)}
                disabled={busy != null}
              >
                <option value="">Any occasion</option>
                {(occasions ?? [])
                  .filter((o) => o.deletedAt == null)
                  .map((o) => (
                    <option key={o._id} value={o._id}>
                      {o.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              <span>Guests from (optional)</span>
              <input
                className="input"
                type="number"
                min={0}
                value={guestCountMin}
                onChange={(e) => setGuestCountMin(e.target.value)}
                placeholder="e.g. 50"
                disabled={busy != null}
              />
            </label>
            <label className="field-label">
              <span>Guests to (optional)</span>
              <input
                className="input"
                type="number"
                min={0}
                value={guestCountMax}
                onChange={(e) => setGuestCountMax(e.target.value)}
                placeholder="e.g. 200"
                disabled={busy != null}
              />
            </label>
          </div>

          <label className="field-label mt-3 block">
            <span>Venue requirement (optional)</span>
            <input
              className="input"
              value={venueRequirement}
              onChange={(e) => setVenueRequirement(e.target.value)}
              placeholder="e.g. Outdoor event — power & tent"
              disabled={busy != null}
            />
          </label>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="field-label-text">Items ({items.length})</span>
              <button
                type="button"
                className="btn btn-ghost min-h-10"
                disabled={busy != null}
                onClick={addItem}
              >
                + Add item
              </button>
            </div>
            {items.length === 0 ? (
              <p className="text-[13px] text-ink-3">
                No items yet. Add chafing dishes, utensils, equipment, etc.
              </p>
            ) : (
              <div className="mt-2 grid gap-2">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="grid gap-2 rounded-md border border-line-2 p-2 md:grid-cols-[1fr_8rem_8rem_auto]"
                  >
                    <input
                      className="input"
                      value={item.description}
                      placeholder="Description — e.g. Chafing dish"
                      disabled={busy != null}
                      onChange={(e) =>
                        updateItem(index, { description: e.target.value })
                      }
                    />
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.0001"
                      value={item.requiredQuantity}
                      placeholder="Qty"
                      disabled={busy != null}
                      onChange={(e) =>
                        updateItem(index, {
                          requiredQuantity: Number(e.target.value) || 0,
                        })
                      }
                    />
                    <select
                      className="input"
                      value={
                        PACK_LIST_UNITS.includes(item.unit) ? item.unit : "each"
                      }
                      disabled={busy != null}
                      onChange={(e) =>
                        updateItem(index, {
                          unit: e.target.value as PackListUnit,
                        })
                      }
                    >
                      {PACK_LIST_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-ghost min-h-10"
                      disabled={busy != null}
                      onClick={() => removeItem(index)}
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
          No pack list templates yet. Create one to generate load sheets faster.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[12px] uppercase text-ink-3">
              <tr>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Scope</th>
                <th className="py-2 pr-3">Items</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((template) => {
                const count = parseItems(template.items).length;
                const band =
                  template.guestCountMin != null ||
                  template.guestCountMax != null
                    ? `${template.guestCountMin ?? 0}–${template.guestCountMax ?? "∞"}`
                    : null;
                return (
                  <tr key={template._id} className="border-t border-line-2">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-ink">
                        {template.name}
                      </div>
                      {template.description ? (
                        <div className="text-[12px] text-ink-3">
                          {template.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-[12px] text-ink-2">
                      {template.serviceStyleId
                        ? `Style: ${styleName(template.serviceStyleId)}`
                        : null}
                      {template.occasionId
                        ? ` · Occasion: ${occasionName(template.occasionId)}`
                        : null}
                      {band ? ` · Guests: ${band}` : null}
                      {template.venueRequirement
                        ? ` · ${template.venueRequirement}`
                        : null}
                      {!template.serviceStyleId &&
                      !template.occasionId &&
                      !band &&
                      !template.venueRequirement
                        ? "Any event"
                        : null}
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
