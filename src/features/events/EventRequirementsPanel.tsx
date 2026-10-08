import type { Id } from "../../lib/api";
import {
  useListEquipment,
  useListIngredient,
} from "../../lib/manifest-convex-react";
import { useEventPackItems } from "../../lib/useEventAreaRows";
import {
  useEventEquipmentReservations,
  useEventIngredientDemands,
  useEventPackLists,
  useEventRentalOrderLines,
} from "../../lib/useEventRows";
import { useRentalVendorChoices } from "../facilities/equipmentCheckout";
import {
  REQUIREMENT_KIND_LABEL,
  buildEventRequirements,
  type RequirementKind,
} from "../logistics/eventRequirements";
import "./EventRequirementsPanel.css";

function fromHold(sourcesJson: unknown): boolean {
  if (typeof sourcesJson !== "string" || !sourcesJson) return false;
  try {
    const sources = JSON.parse(sourcesJson) as Array<{ sourceType?: string }>;
    return (
      Array.isArray(sources) &&
      sources.some((source) => source.sourceType === "rental")
    );
  } catch {
    return false;
  }
}

/** Everything this event needs, kept apart by kind, with who is on it. */
export function EventRequirementsPanel({ eventId }: { eventId: Id<"events"> }) {
  const demands = useEventIngredientDemands(eventId) ?? [];
  const ingredients = useListIngredient() ?? [];
  const holds = useEventEquipmentReservations(eventId) ?? [];
  const equipment = useListEquipment() ?? [];
  const rentals = useEventRentalOrderLines(eventId) ?? [];
  const packLists = useEventPackLists(eventId) ?? [];
  const packItems = useEventPackItems(eventId) ?? [];
  const vendors = useRentalVendorChoices() ?? [];

  const vendorName = new Map(vendors.map((v) => [String(v.vendorId), v.name]));
  const ingredientName = new Map(
    ingredients.map((row) => [String(row._id), String(row.name)]),
  );
  const equipmentById = new Map(equipment.map((row) => [String(row._id), row]));
  const listIds = new Set(
    packLists
      .filter(
        (row) =>
          row.eventId === eventId &&
          row.deletedAt == null &&
          row.status !== "cancelled",
      )
      .map((row) => String(row._id)),
  );

  const lines = buildEventRequirements({
    demands: demands
      .filter((row) => row.eventId === eventId && row.deletedAt == null)
      .map((row) => ({
        id: String(row._id),
        ingredientName:
          ingredientName.get(String(row.ingredientId)) ?? "Ingredient",
        requiredQuantity: Number(row.requiredQuantity ?? 0),
        unit: String(row.unit ?? "each"),
        status: String(row.status),
        vendorName: row.preferredVendorId
          ? vendorName.get(String(row.preferredVendorId))
          : null,
      })),
    holds: holds
      .filter((row) => row.eventId === eventId && row.deletedAt == null)
      .map((row) => {
        const item = equipmentById.get(String(row.equipmentId));
        return {
          id: String(row._id),
          equipmentName: String(item?.name ?? "Equipment"),
          ownership: item?.ownership === "rented" ? "rented" : "owned",
          quantity: Number(row.quantity ?? 0),
          countUnit: item?.countUnit ?? null,
          status: String(row.status),
          homeLocation: item?.homeLocation ?? null,
          vendorName: item?.vendorId
            ? vendorName.get(String(item.vendorId))
            : null,
        } as const;
      }),
    rentals: rentals
      .filter((row) => row.eventId === eventId && row.deletedAt == null)
      .map((row) => ({
        id: String(row._id),
        description: String(row.description),
        vendorName: vendorName.get(String(row.vendorId)) ?? "Vendor",
        quantity: Number(row.quantity ?? 0),
        countUnit: String(row.countUnit ?? "each"),
        status: String(row.status),
        deliveredQuantity: row.deliveredQuantity ?? null,
        returnedQuantity: row.returnedQuantity ?? null,
      })),
    packLines: packItems
      .filter(
        (row) =>
          listIds.has(String(row.packListId)) &&
          row.deletedAt == null &&
          row.retiredAt == null &&
          row.status !== "pending",
      )
      .map((row) => ({
        id: String(row._id),
        description: String(row.description),
        requiredQuantity: Number(row.requiredQuantity ?? 0),
        packedQuantity: Number(row.packedQuantity ?? 0),
        unit: String(row.unit ?? "each"),
        category: row.category ?? null,
        ownership: row.ownership ?? null,
        returnNote: row.returnNote ?? null,
        fromHold: fromHold(row.sourcesJson),
        excluded: row.excludedAt != null,
      })),
  });

  const kinds = (Object.keys(REQUIREMENT_KIND_LABEL) as RequirementKind[])
    .map((kind) => ({ kind, rows: lines.filter((line) => line.kind === kind) }))
    .filter((group) => group.rows.length > 0);

  return (
    <section className="card space-y-4 p-5" aria-labelledby="needs-title">
      <div>
        <h2 id="needs-title" className="text-lg font-semibold text-ink">
          What this event needs
        </h2>
        <p className="text-sm text-ink-2">
          Food, our equipment, rentals, supplies and what the client brings,
          each with where it comes from and who is on it.
        </p>
      </div>
      {kinds.length === 0 ? (
        <p className="text-sm text-ink-3">
          Nothing listed yet. Food shows here from the ingredients in the
          dishes' recipes; hold equipment or open the pack list for the rest.
        </p>
      ) : (
        kinds.map((group) => (
          <div key={group.kind}>
            <h3 className="text-sm font-semibold text-ink">
              {REQUIREMENT_KIND_LABEL[group.kind]} ({group.rows.length})
            </h3>
            <div className="supply-table-wrap">
              <table className="supply-table needs-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>How many</th>
                    <th>From</th>
                    <th>Where it stands</th>
                    <th>Who is on it</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((line) => (
                    <tr key={line.key}>
                      <td>{line.name}</td>
                      <td className="supply-number">
                        {Number(line.quantity.toFixed(2))} {line.unit}
                      </td>
                      <td data-label="From">{line.source}</td>
                      <td data-label="Where it stands">{line.availability}</td>
                      <td data-label="Who is on it">{line.responsible}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
