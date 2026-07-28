import { useState, type FormEvent } from "react";
import {
  useCreateDishContainer,
  useDishContainerRetire,
  useListDishContainer,
} from "../../lib/manifest-convex-react";

// DishContainer management — what a dish ships in, and how it is served.
// These rows are what the PackList cascade fans out: when an approved event
// opens its pack list, one line is listed per container per dish, quantity
// computed from the event's servings. Without a container here, that dish
// contributes nothing to the day-of pack sheet.

type Props = {
  dishId: string;
};

const SERVICE_METHODS = [
  { value: "cooked_on_site", label: "Cooked on site" },
  { value: "cooked_at_kitchen", label: "Cooked at kitchen" },
  { value: "brought_hot", label: "Brought hot" },
  { value: "cold_service", label: "Cold service" },
] as const;

const SERVICE_LABEL: Record<string, string> = Object.fromEntries(
  SERVICE_METHODS.map((m) => [m.value, m.label]),
);

export function DishContainersPanel({ dishId }: Props) {
  const containers = useListDishContainer();
  const defineContainer = useCreateDishContainer();
  const retireContainer = useDishContainerRetire();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = (containers ?? [])
    .filter(
      (row) =>
        row.deletedAt == null &&
        row.dishId === dishId &&
        row.status === "active",
    )
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

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

  async function onRetire(id: string, version: number | undefined) {
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

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Containers &amp; service method</h2>
        <span>{rows.length} containers</span>
      </div>

      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
      {notice ? (
        <p className="text-[13px] text-ok" role="status">
          {notice}
        </p>
      ) : null}

      {containers === undefined ? (
        <p className="text-[13px] text-ink-2">Loading containers…</p>
      ) : rows.length === 0 ? (
        <div className="document-empty">
          <p>
            No containers on this dish. Until one exists, this dish adds nothing
            to the day-of pack list.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li
              key={row._id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
              data-testid="dish-container-row"
            >
              <div>
                <p className="text-[14px] font-medium text-ink">{row.name}</p>
                <p className="font-mono text-[11px] text-ink-3">
                  {SERVICE_LABEL[String(row.serviceMethod)] ??
                    String(row.serviceMethod)}{" "}
                  · holds {row.servingsPerContainer}
                  {row.baseQuantity ? ` · +${row.baseQuantity} always` : ""}
                </p>
                {row.equipmentNotes ? (
                  <p className="text-[11px] text-ink-2">{row.equipmentNotes}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy != null}
                onClick={() => void onRetire(row._id, row.version)}
              >
                {busy === row._id ? "Working…" : "Retire"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={onDefine}>
        <label className="block text-[12px]">
          <span className="meta-term">Container</span>
          <input
            name="name"
            className="input mt-1"
            placeholder="Full hotel pan"
            required
          />
        </label>
        <label className="block text-[12px]">
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
        <label className="block text-[12px]">
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
        <label className="block text-[12px]">
          <span className="meta-term">Always send (extra)</span>
          <input
            name="baseQuantity"
            type="number"
            min={0}
            defaultValue={0}
            className="input mt-1"
          />
        </label>
        <label className="block text-[12px] sm:col-span-2">
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
    </section>
  );
}
