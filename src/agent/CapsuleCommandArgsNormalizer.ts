import type {
  CapsuleCommandDescriptor,
  CapsuleCommandParameter,
} from "./CapsuleCommandCatalog";

/**
 * Aligns agent/MCP client args with Convex mutation validators.
 * Wiring advertises datetime as string; generated Convex args use float64 ms
 * (same as authored UI: `new Date(...).getTime()`).
 */
export class CapsuleCommandArgsNormalizer {
  normalize(
    descriptor: CapsuleCommandDescriptor,
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    const next: Record<string, unknown> = { ...args };
    for (const param of descriptor.parameters) {
      if (param.ownership !== "client") continue;
      if (!(param.name in next)) continue;
      next[param.name] = this.normalizeValue(param, next[param.name]);
    }
    return next;
  }

  private normalizeValue(
    param: CapsuleCommandParameter,
    value: unknown,
  ): unknown {
    if (
      param.constraints?.dateLike ||
      param.irTypeName === "datetime" ||
      param.irTypeName === "timestamp"
    ) {
      return this.toEpochMs(value);
    }
    return value;
  }

  private toEpochMs(value: unknown): unknown {
    if (value == null) return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const asNumber = Number(value);
      if (Number.isFinite(asNumber) && value.trim() === String(asNumber)) {
        return asNumber;
      }
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return value;
  }
}
