import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { formatCount } from "../../lib/format";
import {
  useCreateEventTemplate,
  useEventTemplateArchive,
  useEventTemplateReactivate,
  useEventTemplateRevise,
  useListClient,
  useListEvent,
  useListEventTemplate,
  useListMenu,
} from "../../lib/manifest-convex-react";
import { ArrowLeftIcon, PlusIcon } from "../../ui/icons";
import {
  EmptyState,
  PageHeader,
  StatusChip,
  TableSkeleton,
} from "../../ui/primitives";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { clientDisplayName } from "./clientName";
import { FailureBanner } from "./FailureBanner";

type TemplateDoc = {
  _id: string;
  version: number;
  name: string;
  clientType: string;
  eventType: string;
  defaultHeadcount: number;
  menuId?: string | null;
  defaultStaffRoles: string[];
  typicalEquipment: string[];
  notes?: string | null;
  status: string;
  deletedAt?: number | null;
};

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function lines(value: string): string[] | undefined {
  const values = value
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

export function EventTemplatesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromEventId = searchParams.get("fromEvent")?.trim() || "";
  const templates = useListEventTemplate();
  const events = useListEvent();
  const clients = useListClient();
  const menus = useListMenu();
  const createTemplate = useCreateEventTemplate();
  const reviseTemplate = useEventTemplateRevise();
  const archiveTemplate = useEventTemplateArchive();
  const reactivateTemplate = useEventTemplateReactivate();
  const [showForm, setShowForm] = useState(fromEventId !== "");
  const [editing, setEditing] = useState<TemplateDoc | null>(null);
  const [sourceEventId, setSourceEventId] = useState(fromEventId);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);

  const rows = useMemo(
    () =>
      ((templates ?? []) as TemplateDoc[])
        .filter((t) => t.deletedAt == null)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [templates],
  );
  const availableMenus = (menus ?? []).filter(
    (menu) => menu.deletedAt == null && menu.status !== "archived",
  );
  const sourceEvents = (events ?? []).filter(
    (event) => event.deletedAt == null && event.plannedAt != null,
  );
  const sourceEvent = sourceEvents.find((e) => e._id === sourceEventId);
  const sourceClient = (clients ?? []).find(
    (c) => c._id === sourceEvent?.clientId,
  );
  const menuName = (menuId: string | null | undefined) =>
    (menus ?? []).find((menu) => menu._id === menuId)?.name;

  const run = async (work: () => Promise<void>) => {
    setFailure(null);
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(false);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setSourceEventId("");
    if (fromEventId) setSearchParams({}, { replace: true });
  };

  const submit = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const data = new FormData(formEvent.currentTarget);
    const params = {
      name: String(data.get("name") ?? "").trim(),
      clientType: String(data.get("clientType")) as "company" | "person",
      eventType: String(data.get("eventType") ?? "").trim(),
      defaultHeadcount: Number(data.get("defaultHeadcount")),
      menuId: optional(String(data.get("menuId") ?? "")),
      defaultStaffRoles: lines(String(data.get("defaultStaffRoles") ?? "")),
      typicalEquipment: lines(String(data.get("typicalEquipment") ?? "")),
      notes: optional(String(data.get("notes") ?? "")),
    };
    void run(async () => {
      if (editing) {
        await reviseTemplate({
          docId: editing._id,
          version: editing.version,
          ...params,
        });
      } else {
        await createTemplate({
          ...params,
          sourceEventId: sourceEventId || undefined,
        });
      }
      closeForm();
    });
  };

  const archive = (template: TemplateDoc) => {
    const reason = window.prompt("Archive reason")?.trim();
    if (!reason) return;
    void run(async () => {
      await archiveTemplate({
        docId: template._id,
        version: template.version,
        reason,
      });
    });
  };

  const reactivate = (template: TemplateDoc) => {
    void run(async () => {
      await reactivateTemplate({
        docId: template._id,
        version: template.version,
      });
    });
  };

  return (
    <div className="space-y-4">
      <Link
        to="/events"
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink"
      >
        <ArrowLeftIcon width={12} height={12} /> All events
      </Link>
      <PageHeader
        title="Event templates"
        lead="Named starting points for common event types — client type, headcount, menu, staff roles, and equipment pre-configured."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <PlusIcon /> New template
          </button>
        }
      />

      {failure ? <FailureBanner failure={failure} /> : null}

      {showForm || editing ? (
        <form
          key={editing?._id ?? sourceEvent?._id ?? "blank"}
          onSubmit={submit}
          className="card space-y-3 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold">
              {editing ? `Edit "${editing.name}"` : "New template"}
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={closeForm}
              >
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" disabled={busy}>
                {busy ? "Saving…" : editing ? "Save changes" : "Save template"}
              </button>
            </div>
          </div>
          {!editing ? (
            <label className="field-label">
              Start from an existing event (optional)
              <select
                value={sourceEventId}
                onChange={(e) => setSourceEventId(e.target.value)}
                className="input max-w-96"
              >
                <option value="">Blank template</option>
                {sourceEvents.map((event) => (
                  <option key={event._id} value={event._id}>
                    {event.title} —{" "}
                    {clientDisplayName(event.clientId, clients ?? [])}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="field-label">
              Template name
              <input
                name="name"
                className="input"
                required
                autoFocus
                defaultValue={
                  editing?.name ??
                  (sourceEvent ? `${sourceEvent.eventType} standard` : "")
                }
              />
            </label>
            <label className="field-label">
              Client type
              <select
                name="clientType"
                className="input"
                defaultValue={
                  editing?.clientType ?? sourceClient?.clientType ?? "company"
                }
              >
                <option value="company">Company</option>
                <option value="person">Person</option>
              </select>
            </label>
            <label className="field-label">
              Event type
              <input
                name="eventType"
                className="input"
                required
                placeholder="Wedding, gala, corporate dinner…"
                defaultValue={
                  editing?.eventType ?? sourceEvent?.eventType ?? ""
                }
              />
            </label>
            <label className="field-label">
              Default headcount
              <input
                name="defaultHeadcount"
                type="number"
                min={1}
                max={100000}
                className="input"
                required
                defaultValue={
                  editing?.defaultHeadcount ??
                  sourceEvent?.expectedHeadcount ??
                  1
                }
              />
            </label>
            <label className="field-label">
              Linked menu
              <select
                name="menuId"
                className="input"
                defaultValue={editing?.menuId ?? ""}
              >
                <option value="">No menu</option>
                {availableMenus.map((menu) => (
                  <option key={menu._id} value={menu._id}>
                    {menu.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Default staff roles
              <input
                name="defaultStaffRoles"
                className="input"
                placeholder="Comma-separated — chef, server, bartender…"
                defaultValue={editing?.defaultStaffRoles?.join(", ") ?? ""}
              />
            </label>
            <label className="field-label sm:col-span-2">
              Typical equipment
              <input
                name="typicalEquipment"
                className="input"
                placeholder="Comma-separated — chafers, tent, linens…"
                defaultValue={editing?.typicalEquipment?.join(", ") ?? ""}
              />
            </label>
            <label className="field-label">
              Notes
              <input
                name="notes"
                className="input"
                defaultValue={editing?.notes ?? ""}
              />
            </label>
          </div>
        </form>
      ) : null}

      <div className="card overflow-x-auto">
        {templates === undefined ? (
          <TableSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No templates yet"
            hint="Save a fully-configured event as a template to bootstrap the next one."
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th w-full">Template</th>
                <th className="th">Client type</th>
                <th className="th text-right">Headcount</th>
                <th className="th">Menu</th>
                <th className="th">Staff roles</th>
                <th className="th">Equipment</th>
                <th className="th">Status</th>
                <th className="th" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((template) => (
                <tr key={template._id}>
                  <td className="td w-full max-w-0 truncate">
                    <span className="font-medium">{template.name}</span>
                    <span className="ml-2 text-[12px] text-ink-3">
                      {template.eventType}
                    </span>
                  </td>
                  <td className="td text-ink-2">{template.clientType}</td>
                  <td className="td text-right font-mono">
                    {formatCount(template.defaultHeadcount)}
                  </td>
                  <td className="td text-ink-2">
                    {menuName(template.menuId) ?? "—"}
                  </td>
                  <td className="td text-ink-2">
                    {template.defaultStaffRoles?.length
                      ? template.defaultStaffRoles.join(", ")
                      : "—"}
                  </td>
                  <td className="td text-ink-2">
                    {template.typicalEquipment?.length
                      ? template.typicalEquipment.join(", ")
                      : "—"}
                  </td>
                  <td className="td">
                    <StatusChip status={String(template.status)} />
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1.5">
                      {template.status === "active" ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy}
                            onClick={() =>
                              navigate(`/events/new?templateId=${template._id}`)
                            }
                          >
                            Use
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy}
                            onClick={() => {
                              setShowForm(true);
                              setEditing(template);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy}
                            onClick={() => archive(template)}
                          >
                            Archive
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() => reactivate(template)}
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
