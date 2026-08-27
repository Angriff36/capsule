import { VolumeMilliliters } from "./volumeUnitMl";

export type HouseholdVolumeMeasure = {
  quantity: number;
  volumeUnit: string;
};

/** Read "1/2 cup", "1 cup, drained", or "8 fl oz" into a volume measure. */
export class HouseholdVolumeParser {
  parse(text?: string | null): HouseholdVolumeMeasure | undefined {
    if (!text?.trim()) return undefined;
    const trimmed = text.trim().toLowerCase().replaceAll(",", " ");
    const match = trimmed.match(
      /^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)\s+(.+)$/,
    );
    if (!match) return undefined;
    const quantity = HouseholdVolumeParser.parseQuantity(match[1]);
    const volumeUnit = VolumeMilliliters.parseUnitName(match[2] ?? "");
    if (quantity == null || quantity <= 0 || !volumeUnit) return undefined;
    return { quantity, volumeUnit };
  }

  private static parseQuantity(raw: string): number | undefined {
    const text = raw.trim().replace(",", ".");
    const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (mixed) {
      const whole = Number(mixed[1]);
      const numerator = Number(mixed[2]);
      const denominator = Number(mixed[3]);
      if (denominator > 0) return whole + numerator / denominator;
      return undefined;
    }
    const fraction = text.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (fraction) {
      const numerator = Number(fraction[1]);
      const denominator = Number(fraction[2]);
      if (denominator > 0) return numerator / denominator;
      return undefined;
    }
    const decimal = Number(text);
    return Number.isFinite(decimal) && decimal > 0 ? decimal : undefined;
  }
}
