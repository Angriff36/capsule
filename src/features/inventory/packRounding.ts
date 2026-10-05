import { recipeUnitRatio } from "../../lib/recipeUnitConversion";

/** A recorded "1 case = 6 kilogram" pack size for an ingredient. */
export type PackMapping = {
  ingredientId?: string | null;
  kind: string;
  unit: string;
  equalsQuantity: number;
  equalsUnit: string;
  recordedAt?: number | null;
  deletedAt?: number | null;
};

export type PackRounding = {
  /** The exact amount needed, in the order line's unit. Never rounded. */
  need: number;
  lineUnit: string;
  /** The vendor's pack, for example "case". */
  packUnit: string;
  /** One pack, in the order line's unit. */
  packSize: number;
  /** Whole packs that cover the need. */
  packs: number;
  /** packs × packSize, in the order line's unit. */
  roundedQuantity: number;
  /** roundedQuantity − need: what is left over after the event. */
  extra: number;
};

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * Pack rounding is only a suggestion: the need stays exact and the buyer
 * chooses to order whole packs. A pack size counts only when it is recorded
 * for this ingredient and converts to the line's unit without a guess.
 */
export function packRounding(input: {
  need: number;
  lineUnit: string;
  ingredientId: string;
  mappings: readonly PackMapping[];
}): PackRounding | null {
  const { need, lineUnit, ingredientId } = input;
  if (!(need > 0)) return null;
  const pack = input.mappings
    .filter(
      (mapping) =>
        mapping.kind === "pack" &&
        mapping.ingredientId === ingredientId &&
        mapping.deletedAt == null &&
        mapping.recordedAt != null &&
        mapping.equalsQuantity > 0,
    )
    .sort((left, right) => Number(right.recordedAt) - Number(left.recordedAt))
    .map((mapping) => {
      if (mapping.unit === lineUnit) {
        return { packUnit: mapping.unit, packSize: 1 };
      }
      const ratio = recipeUnitRatio(mapping.equalsUnit, lineUnit);
      return ratio == null
        ? null
        : {
            packUnit: mapping.unit,
            packSize: round4(mapping.equalsQuantity * ratio),
          };
    })
    .find((candidate) => candidate != null && candidate.packSize > 0);
  if (!pack) return null;
  const packs = Math.ceil(round4(need / pack.packSize));
  const roundedQuantity = round4(packs * pack.packSize);
  return {
    need,
    lineUnit,
    packUnit: pack.packUnit,
    packSize: pack.packSize,
    packs,
    roundedQuantity,
    extra: round4(roundedQuantity - need),
  };
}
