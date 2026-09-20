import { useState, type FormEvent } from "react";
import {
  useComponentSetServesPerYield,
  useComponentSetStorageWindow,
} from "../../lib/manifest-convex-react";

type YieldStorageRow = {
  _id: string;
  version: number;
  servesPerYield?: number | null;
  storageWindowDays?: number | null;
  storageWindowSource?: string | null;
};

/** The row the first command saved carries the new version for the second. */
function savedVersion(result: unknown, fallback: number): number | undefined {
  if (result == null) return fallback;
  const value = (result as { version?: unknown }).version;
  return typeof value === "number" ? value : undefined;
}

/**
 * How many guests one batch serves, and how long the finished batch keeps.
 * The shelf-life source says where the number came from — it is confirmed by a
 * person, never inferred, so it is saved with the day count.
 */
export function ComponentYieldStoragePanel({
  component,
  onFailure,
}: {
  component: YieldStorageRow;
  onFailure: (error: unknown) => void;
}) {
  const setServesPerYield = useComponentSetServesPerYield();
  const setStorageWindow = useComponentSetStorageWindow();
  const [busy, setBusy] = useState(false);

  const savedServes = component.servesPerYield ?? 1;
  const savedDays = component.storageWindowDays ?? null;
  const savedSource = component.storageWindowSource ?? "";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const serves = Number(data.get("servesPerYield"));
    const daysRaw = String(data.get("storageWindowDays") ?? "").trim();
    const days = Number(daysRaw);
    const source = String(data.get("storageWindowSource") ?? "").trim();
    const servesChanged =
      Number.isFinite(serves) && serves > 0 && serves !== savedServes;
    const storageChanged =
      daysRaw !== "" &&
      Number.isFinite(days) &&
      days >= 0 &&
      (days !== savedDays || source !== savedSource);
    if (!servesChanged && !storageChanged) return;

    void (async () => {
      onFailure(null);
      setBusy(true);
      try {
        const after = servesChanged
          ? await setServesPerYield({
              docId: component._id,
              version: component.version,
              servesPerYield: Math.round(serves),
            })
          : null;
        if (storageChanged) {
          await setStorageWindow({
            docId: component._id,
            version: savedVersion(after, component.version),
            storageWindowDays: Math.round(days),
            source: source || undefined,
          });
        }
      } catch (error) {
        onFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Yield and storage</h2>
        <span>
          {savedDays == null
            ? "Shelf life not on file"
            : `Keeps ${savedDays} days`}
        </span>
      </div>
      <form
        key={`yield-storage:${component._id}:${component.version}`}
        className="culinary-line-form"
        onSubmit={submit}
      >
        <label className="field-label">
          Serves per batch
          <input
            name="servesPerYield"
            type="number"
            min={1}
            step={1}
            className="input"
            defaultValue={savedServes}
            required
          />
        </label>
        <label className="field-label">
          Shelf life (days)
          <input
            name="storageWindowDays"
            type="number"
            min={0}
            step={1}
            className="input"
            placeholder="Not on file"
            defaultValue={savedDays ?? ""}
          />
        </label>
        <label className="field-label sm:col-span-2">
          Shelf life source
          <input
            name="storageWindowSource"
            className="input"
            placeholder="Who or what confirmed the days"
            defaultValue={savedSource}
          />
        </label>
        <button className="btn btn-primary self-end" disabled={busy}>
          {busy ? "Saving…" : "Save yield and storage"}
        </button>
      </form>
    </section>
  );
}
