import { useMutation } from "convex/react";
import { useRef, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import {
  useCreateAttachment,
  useCreateEquipmentPart,
  useEquipmentClearPrimaryImage,
  useEquipmentPartDetach,
  useEquipmentSetPrimaryImage,
  useListEquipmentPart,
} from "../../lib/manifest-convex-react";
import { uploadCatalogPrimaryImage } from "../attachments/catalogPrimaryImageUpload";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";
import { BarcodeLabel } from "../../ui/BarcodeLabel";
import { scanLabelFor } from "../logistics/packScan";
import type { VendorChoice } from "./EquipmentForm";

type CatalogItem = {
  _id: string;
  version: number;
  name: string;
  assetTag?: string | null;
  ownership: string;
  trackingMode?: string | null;
  serialNumber?: string | null;
  description?: string | null;
  countUnit?: string | null;
  replacementCost?: number | null;
  customerPrice?: number | null;
  vendorId?: string | null;
  homeLocation?: string | null;
  primaryImageStorageId?: string | null;
};

type PartRow = {
  _id: string;
  version: number;
  equipmentId: string;
  partEquipmentId: string;
  role: string;
  quantity: number;
  removedAt?: number | null;
  deletedAt?: number | null;
};

/** One catalog item's photo, rental facts, bundle parts and accessories. */
export function EquipmentDetailPanel({
  item,
  catalog,
  vendors,
  onClose,
  onError,
}: {
  item: CatalogItem;
  catalog: CatalogItem[];
  vendors: VendorChoice[];
  onClose: () => void;
  onError: (error: unknown) => void;
}) {
  const parts = (useListEquipmentPart() ?? []) as PartRow[];
  const attachPart = useCreateEquipmentPart();
  const detachPart = useEquipmentPartDetach();
  const generateUploadUrl = useMutation(api.fileStorage.generateUploadUrl);
  const createAttachment = useCreateAttachment();
  const setPrimaryImage = useEquipmentSetPrimaryImage();
  const clearPrimaryImage = useEquipmentClearPrimaryImage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const nameOf = new Map(catalog.map((row) => [row._id, row.name]));
  const vendorName = vendors.find(
    (vendor) => vendor.vendorId === item.vendorId,
  )?.name;
  const itemParts = parts.filter(
    (row) =>
      row.equipmentId === item._id &&
      row.removedAt == null &&
      row.deletedAt == null,
  );

  const addPart = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const partEquipmentId = String(data.get("partEquipmentId") ?? "");
    if (!partEquipmentId) return;
    void run(async () => {
      await attachPart({
        equipmentId: item._id,
        partEquipmentId,
        role: String(data.get("role")) as "part" | "accessory",
        quantity: Number(data.get("quantity") ?? 1),
      });
      form.reset();
    });
  };

  const facts: Array<[string, string]> = [
    [
      "Counted",
      item.trackingMode === "serialized"
        ? `One piece${item.serialNumber ? `, serial ${item.serialNumber}` : ""}`
        : `As a group, ${item.countUnit?.trim() || "each"}`,
    ],
    [
      "Replacement cost",
      item.replacementCost != null
        ? formatMoney(item.replacementCost)
        : "Not set",
    ],
    [
      "Client price",
      item.customerPrice != null ? formatMoney(item.customerPrice) : "Not set",
    ],
    ["Storage place", item.homeLocation?.trim() || "Not set"],
  ];
  if (item.ownership === "rented") {
    facts.push([
      "Rented from",
      vendorName ?? (item.vendorId ? "Vendor not found" : "Not set"),
    ]);
  }

  return (
    <section className="supply-form" aria-label={`${item.name} details`}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Equipment details</p>
          <h2>{item.name}</h2>
          {item.description ? (
            <p className="text-sm text-ink-2">{item.description}</p>
          ) : null}
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="grid gap-5 md:grid-cols-[14rem_1fr]">
        <div className="space-y-2">
          <DishPrimaryImage
            storageId={item.primaryImageStorageId}
            alt={item.name}
            size="hero"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void run(() =>
                uploadCatalogPrimaryImage(
                  file,
                  "equipment",
                  item._id,
                  item.version,
                  { generateUploadUrl, createAttachment, setPrimaryImage },
                ),
              );
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {item.primaryImageStorageId ? "Replace photo" : "Add photo"}
            </button>
            {item.primaryImageStorageId ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    clearPrimaryImage({
                      docId: item._id,
                      version: item.version,
                    }),
                  )
                }
              >
                Remove photo
              </button>
            ) : null}
          </div>
          {item.assetTag?.trim() ? (
            <BarcodeLabel
              code={scanLabelFor.equipment(item.assetTag)}
              title={item.name}
              subtitle={item.homeLocation?.trim() || undefined}
            />
          ) : null}
        </div>
        <div className="space-y-4">
          <dl className="grid gap-2 sm:grid-cols-2">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-ink-3">{label}</dt>
                <dd className="text-sm text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <div>
            <h3 className="text-sm font-semibold text-ink">Goes with it</h3>
            {itemParts.length === 0 ? (
              <p className="text-sm text-ink-3">No parts or add-ons yet.</p>
            ) : (
              <ul className="space-y-1">
                {itemParts.map((part) => (
                  <li
                    key={part._id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      {part.quantity} ×{" "}
                      {nameOf.get(part.partEquipmentId) ?? "Removed item"}{" "}
                      <span className="text-ink-3">
                        (
                        {part.role === "part"
                          ? "always goes with it"
                          : "offered with it"}
                        )
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          detachPart({
                            docId: part._id,
                            version: part.version,
                          }),
                        )
                      }
                    >
                      Take off
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="mt-2 flex flex-wrap items-end gap-2"
              onSubmit={addPart}
            >
              <label className="field-label">
                Item
                <select name="partEquipmentId" className="input" required>
                  <option value="">Pick an item</option>
                  {catalog
                    .filter((row) => row._id !== item._id)
                    .map((row) => (
                      <option key={row._id} value={row._id}>
                        {row.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field-label">
                How
                <select name="role" className="input" defaultValue="part">
                  <option value="part">Always goes with it</option>
                  <option value="accessory">Offered with it</option>
                </select>
              </label>
              <label className="field-label">
                How many
                <input
                  name="quantity"
                  className="input"
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={1}
                />
              </label>
              <button className="btn btn-secondary btn-sm" disabled={busy}>
                Add
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
