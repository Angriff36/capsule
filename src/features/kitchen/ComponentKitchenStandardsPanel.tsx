import { Fragment, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useComponentSetKitchenStandards,
  useComponentSetPrimaryImage,
  useListEquipment,
} from "../../lib/manifest-convex-react";
import { ComponentPrimaryImageUploader } from "../attachments/ComponentPrimaryImageUploader";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";
import { RecordPictures } from "../attachments/RecordPictures";
import {
  activeRecipeEquipment,
  addRecipeEquipment,
  recipeEquipmentPieces,
  type RecipeEquipmentOption,
} from "./recipeEquipment";

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
  const setPrimaryImage = useComponentSetPrimaryImage();
  const equipment = useListEquipment() as RecipeEquipmentOption[] | undefined;
  const equipmentChoices = activeRecipeEquipment(equipment);
  const equipmentBox = useRef<HTMLTextAreaElement>(null);
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
      <RecordPictures
        parentType="component"
        parentId={component._id}
        name={component.name}
        mainStorageId={component.primaryImageStorageId}
        onMakeMain={(storageId, fileName) =>
          setPrimaryImage({
            docId: component._id,
            version: component.version,
            storageId,
            fileName,
          })
        }
        onError={onFailure}
      />
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
              ) : row.key === "equipmentNotes" ? (
                <ul className="m-0 list-none p-0">
                  {recipeEquipmentPieces(row.value, equipment).map(
                    (piece, index) => (
                      <li key={`${piece.text}:${index}`}>
                        {piece.item ? (
                          <>
                            <Link to="/facilities/equipment">
                              {piece.item.name}
                            </Link>
                            <span className="text-ink-3">
                              {" "}
                              · {piece.item.quantity ?? 0}{" "}
                              {piece.item.countUnit?.trim() || "each"} on hand
                            </span>
                          </>
                        ) : (
                          piece.text
                        )}
                      </li>
                    ),
                  )}
                </ul>
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
            <Fragment key={key}>
              <label className="field-label sm:col-span-2">
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
                    ref={key === "equipmentNotes" ? equipmentBox : undefined}
                    className="input min-h-16 py-2"
                    placeholder={hint}
                    defaultValue={component[key] ?? ""}
                  />
                )}
              </label>
              {key === "equipmentNotes" && equipmentChoices.length > 0 ? (
                <label className="field-label sm:col-span-2">
                  Add from the equipment list
                  <select
                    className="input"
                    value=""
                    onChange={(event) => {
                      const box = equipmentBox.current;
                      if (box && event.target.value) {
                        box.value = addRecipeEquipment(
                          box.value,
                          event.target.value,
                        );
                      }
                    }}
                  >
                    <option value="">Pick a piece of equipment</option>
                    {equipmentChoices.map((item) => (
                      <option key={item._id} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </Fragment>
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
