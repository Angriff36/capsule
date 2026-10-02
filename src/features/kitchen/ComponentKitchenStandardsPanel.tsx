import { useState, type FormEvent } from "react";
import { useComponentSetKitchenStandards } from "../../lib/manifest-convex-react";
import { ComponentPrimaryImageUploader } from "../attachments/ComponentPrimaryImageUploader";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";

export type KitchenStandardsRow = {
  _id: string;
  version: number;
  name: string;
  equipmentNotes?: string | null;
  platingInstructions?: string | null;
  coolingInstructions?: string | null;
  holdingInstructions?: string | null;
  reheatInstructions?: string | null;
  substitutionNotes?: string | null;
  videoUrl?: string | null;
  primaryImageStorageId?: string | null;
};

type StandardKey =
  | "equipmentNotes"
  | "platingInstructions"
  | "coolingInstructions"
  | "holdingInstructions"
  | "reheatInstructions"
  | "substitutionNotes"
  | "videoUrl";

const STANDARDS: { key: StandardKey; label: string; hint: string }[] = [
  {
    key: "equipmentNotes",
    label: "Equipment",
    hint: "Pans, tools and machines this recipe needs",
  },
  {
    key: "platingInstructions",
    label: "Plating",
    hint: "How a portion goes on the plate or platter",
  },
  {
    key: "coolingInstructions",
    label: "Cooling",
    hint: "How to cool it down after cooking",
  },
  {
    key: "holdingInstructions",
    label: "Holding",
    hint: "How to keep it hot or cold until service",
  },
  {
    key: "reheatInstructions",
    label: "Reheating",
    hint: "How to bring it back to temperature",
  },
  {
    key: "substitutionNotes",
    label: "Approved swaps",
    hint: "What may be swapped in, and when",
  },
  { key: "videoUrl", label: "Video", hint: "Link to a how-to video" },
];

export const NOT_ON_FILE = "Not on file";

/** Each standard with its saved words, or null when nobody has written it. */
export function kitchenStandards(row: KitchenStandardsRow) {
  return STANDARDS.map(({ key, label }) => {
    const value = row[key]?.trim();
    return { key, label, value: value ? value : null };
  });
}

function isWebLink(value: string) {
  return /^https?:\/\//i.test(value);
}

/**
 * What a cook needs at the station besides the method: equipment, plating,
 * cooling, holding, reheating, approved swaps, a photo and a video. A blank
 * standard reads "Not on file" so nobody mistakes it for "nothing needed".
 */
export function ComponentKitchenStandardsPanel({
  component,
  onFailure,
}: {
  component: KitchenStandardsRow;
  onFailure: (error: unknown) => void;
}) {
  const setStandards = useComponentSetKitchenStandards();
  const [busy, setBusy] = useState(false);
  const rows = kitchenStandards(component);
  const onFile = rows.filter((row) => row.value != null).length;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const args: Record<string, unknown> = {
      docId: component._id,
      version: component.version,
    };
    for (const { key } of STANDARDS) {
      const value = String(data.get(key) ?? "").trim();
      if (value) args[key] = value;
    }
    void (async () => {
      onFailure(null);
      setBusy(true);
      try {
        await setStandards(args);
      } catch (error) {
        onFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <section className="culinary-section" aria-label="Kitchen standards">
      <div className="culinary-section-heading">
        <h2>Kitchen standards</h2>
        <span>
          {onFile} of {rows.length} on file
        </span>
      </div>
      {component.primaryImageStorageId ? (
        <DishPrimaryImage
          storageId={component.primaryImageStorageId}
          alt={component.name}
          size="hero"
        />
      ) : (
        <p className="text-base text-ink-3">Photo: {NOT_ON_FILE}</p>
      )}
      <dl className="culinary-facts">
        {rows.map((row) => (
          <div key={row.key} data-testid={`standard-${row.key}`}>
            <dt>{row.label}</dt>
            <dd className="whitespace-pre-line">
              {row.value == null ? (
                <span className="text-ink-3">{NOT_ON_FILE}</span>
              ) : row.key === "videoUrl" && isWebLink(row.value) ? (
                <a href={row.value} target="_blank" rel="noreferrer">
                  Watch the video
                </a>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
      <details className="recipe-add-editor">
        <summary>Edit standards</summary>
        <form
          key={`standards:${component._id}:${component.version}`}
          className="culinary-create-grid"
          onSubmit={submit}
        >
          {STANDARDS.map(({ key, label, hint }) => (
            <label key={key} className="field-label sm:col-span-2">
              {label}
              {key === "videoUrl" ? (
                <input
                  name={key}
                  type="url"
                  className="input"
                  placeholder={hint}
                  defaultValue={component[key] ?? ""}
                />
              ) : (
                <textarea
                  name={key}
                  className="input min-h-16 py-2"
                  placeholder={hint}
                  defaultValue={component[key] ?? ""}
                />
              )}
            </label>
          ))}
          <button className="btn btn-primary self-end" disabled={busy}>
            {busy ? "Saving…" : "Save standards"}
          </button>
        </form>
      </details>
      <details className="recipe-add-editor">
        <summary>
          {component.primaryImageStorageId ? "Edit photo" : "Add photo"}
        </summary>
        <ComponentPrimaryImageUploader
          componentId={component._id}
          componentVersion={component.version}
          componentName={component.name}
          storageId={component.primaryImageStorageId}
          onError={onFailure}
        />
      </details>
    </section>
  );
}
