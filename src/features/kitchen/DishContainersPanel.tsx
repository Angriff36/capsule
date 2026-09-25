import { useState, type FormEvent } from "react";
import { formatCountNoun } from "../../lib/format";
import { TableSkeleton } from "../../ui/primitives";
import { useActionPrompt } from "../../ui/action-prompt";
import { useActionNotice, useActionFailure } from "../../ui/action-result";
import {
  useCreateDishContainer,
  useDishContainerReinstate,
  useDishContainerRetire,
  useListDishContainer,
} from "../../lib/manifest-convex-react";
import {
  DishContainerEditForm,
  SERVICE_LABEL,
  SERVICE_METHODS,
} from "./DishContainerEditForm";

// DishContainer management — what a dish ships in, and how it is served.
// These rows are what the PackList cascade fans out: when an approved event
// opens its pack list, one line is listed per container per dish, quantity
// computed from the event's servings. Without a container here, that dish
// contributes nothing to the day-of pack sheet.

type Props = {
  dishId: string;
};

export function DishContainersPanel({ dishId }: Props) {
  const containers = useListDishContainer();
  const defineContainer = useCreateDishContainer();
  const retireContainer = useDishContainerRetire();
  const reinstateContainer = useDishContainerReinstate();

  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { error, setError } = useActionFailure();
  const { notice, setNotice } = useActionNotice();
  const { prompt, host: promptHost } = useActionPrompt();

  const forThisDish = (containers ?? [])
    .filter((row) => row.deletedAt == null && row.dishId === dishId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const rows = forThisDish.filter((row) => row.status === "active");
  const retiredRows = forThisDish.filter((row) => row.status === "retired");

  async function onDefine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const servingsPerContainer = Number(data.get("servingsPerContainer") ?? 0);
    if (!name || servingsPerContainer < 1) {
      setError(
        "Container name and a servings-per-container of at least 1 are required.",
      );
      return;
    }
    setBusy("define");
    setError(null);
    setNotice(null);
    try {
      await defineContainer({
        dishId,
        name,
        serviceMethod: String(data.get("serviceMethod") ?? "cooked_at_kitchen"),
        servingsPerContainer,
        baseQuantity: Number(data.get("baseQuantity") ?? 0),
        equipmentNotes:
          String(data.get("equipmentNotes") ?? "").trim() || undefined,
      });
      form.reset();
      setNotice(
        "Container added. It will be listed on the pack list of every approved event using this dish.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add the container.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onRetire(
    id: string,
    version: number | undefined,
    name: string,
  ) {
    const ok = await prompt.askConfirm({
      title: "Retire container",
      description: `Retire "${name}"? It stops appearing on the pack list of events using this dish.`,
      confirmLabel: "Retire",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await retireContainer({ docId: id, version });
      setNotice("Container retired.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not retire the container.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onReinstate(id: string, version: number | undefined) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await reinstateContainer({ docId: id, version });
      setNotice(
        "Container reinstated. It is listed again on the pack list of events using this dish.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not reinstate the container.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Containers &amp; service method</h2>
        <span>{formatCountNoun(rows.length, "container")}</span>
      </div>

      {promptHost}
      {error ? <p className="text-base text-danger">{error}</p> : null}
      {notice ? (
        <p className="text-base text-ok" role="status">
          {notice}
        </p>
      ) : null}

      {containers === undefined ? (
        <TableSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <div className="recipe-empty">
          <p>
            No serving containers on file. Add one to include it on event pack
            lists.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row._id} className="py-3" data-testid="dish-container-row">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-medium text-ink">{row.name}</p>
                  <p className="text-sm text-ink-3">
                    {SERVICE_LABEL[String(row.serviceMethod)] ??
                      String(row.serviceMethod)}{" "}
                    · holds {row.servingsPerContainer}
                    {row.baseQuantity ? ` · +${row.baseQuantity} always` : ""}
                  </p>
                  {row.equipmentNotes ? (
                    <p className="text-base text-ink-2">{row.equipmentNotes}</p>
                  ) : null}
                  {row.handlingNotes ? (
                    <p className="text-base text-ink-2">{row.handlingNotes}</p>
                  ) : null}
                </div>
                <div className="supply-row-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy != null}
                    onClick={() =>
                      setEditingId((current) =>
                        current === row._id ? null : row._id,
                      )
                    }
                  >
                    {editingId === row._id ? "Close" : "Edit"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy != null}
                    onClick={() =>
                      void onRetire(row._id, row.version, row.name)
                    }
                  >
                    {busy === row._id ? "Working…" : "Retire"}
                  </button>
                </div>
              </div>
              {editingId === row._id ? (
                <DishContainerEditForm
                  key={`${row._id}:${row.version}`}
                  container={{
                    _id: row._id,
                    version: Number(row.version),
                    name: String(row.name),
                    serviceMethod: String(row.serviceMethod),
                    servingsPerContainer: Number(row.servingsPerContainer),
                    baseQuantity: Number(row.baseQuantity ?? 0),
                    unit: String(row.unit),
                    equipmentNotes: row.equipmentNotes,
                    handlingNotes: row.handlingNotes,
                    sortOrder: Number(row.sortOrder ?? 0),
                  }}
                  onSaved={() => {
                    setEditingId(null);
                    setNotice("Container updated.");
                  }}
                  onCancel={() => setEditingId(null)}
                  onError={setError}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {retiredRows.length > 0 ? (
        <div className="mt-4">
          <div className="culinary-section-heading">
            <h3 className="text-lg font-semibold text-ink-3">Retired</h3>
            <span>{formatCountNoun(retiredRows.length, "container")}</span>
          </div>
          <ul className="divide-y divide-line">
            {retiredRows.map((row) => (
              <li
                key={row._id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-ink-3"
                data-testid="dish-container-retired-row"
              >
                <div>
                  <p className="text-base font-medium">{row.name}</p>
                  <p className="text-sm">
                    {SERVICE_LABEL[String(row.serviceMethod)] ??
                      String(row.serviceMethod)}{" "}
                    · holds {row.servingsPerContainer} · not on pack lists
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                  onClick={() => void onReinstate(row._id, row.version)}
                >
                  {busy === row._id ? "Working…" : "Reinstate"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="recipe-add-editor">
        <summary>Add container</summary>
        <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={onDefine}>
          <label className="block text-sm">
            <span className="meta-term">Container</span>
            <input
              name="name"
              className="input mt-1"
              placeholder="Full hotel pan"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="meta-term">Service method</span>
            <select
              name="serviceMethod"
              className="input mt-1"
              defaultValue="cooked_at_kitchen"
            >
              {SERVICE_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="meta-term">Servings per container</span>
            <input
              name="servingsPerContainer"
              type="number"
              min={1}
              defaultValue={25}
              className="input mt-1"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="meta-term">Always send (extra)</span>
            <input
              name="baseQuantity"
              type="number"
              min={0}
              defaultValue={0}
              className="input mt-1"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="meta-term">Equipment / handling notes</span>
            <input
              name="equipmentNotes"
              className="input mt-1"
              placeholder="2 chafers, 1 induction burner"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy != null}
            >
              {busy === "define" ? "Adding…" : "Add container"}
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}
