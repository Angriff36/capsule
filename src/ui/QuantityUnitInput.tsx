import { useId } from "react";
import {
  describeLineConversion,
  normalizeUnit,
  parseQuantityInput,
  type ItemScope,
  type ItemUnitMappingLike,
  type UnitCode,
} from "../../convex/lib/culinaryModel/units";

type Props = {
  name: string;
  value: string;
  onChange: (value: string) => void;
  fallbackUnit: UnitCode;
  canonicalUnit?: string | null;
  allowedUnits?: readonly UnitCode[];
  mappings?: readonly ItemUnitMappingLike[];
  scope?: ItemScope;
  required?: boolean;
  disabled?: boolean;
};

function formatQuantity(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/**
 * A free-form recipe quantity field that keeps the entered unit while showing
 * the catalog-unit equivalent. It deliberately has no data hook: callers own
 * their save action and may use this in any culinary form.
 */
export function QuantityUnitInput({
  name,
  value,
  onChange,
  fallbackUnit,
  canonicalUnit,
  allowedUnits,
  mappings = [],
  scope,
  required = false,
  disabled = false,
}: Props) {
  const parsed = parseQuantityInput(value, fallbackUnit, allowedUnits);
  const hintId = useId();
  let feedback: string | null = null;
  let warning = false;

  if (parsed.status === "invalid") {
    feedback = parsed.message;
    warning = true;
  } else if (parsed.status === "parsed" && canonicalUnit) {
    const converted = describeLineConversion(
      parsed.quantity,
      parsed.unit,
      canonicalUnit,
      mappings,
      scope,
    );
    if (converted.status === "resolved") {
      feedback = `= ${formatQuantity(converted.quantity)} ${normalizeUnit(canonicalUnit) ?? canonicalUnit}, the unit this is stocked in`;
    } else if (converted.status === "unresolved") {
      feedback = converted.reason;
      warning = true;
    }
  }

  return (
    <div className="space-y-1">
      <input
        name={name}
        type="text"
        className="input"
        value={value}
        placeholder={`e.g. 2 ${fallbackUnit}`}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={feedback ? hintId : undefined}
        required={required}
        disabled={disabled}
      />
      {feedback ? (
        <p
          id={hintId}
          className={warning ? "text-xs text-warn" : "text-xs text-ink-3"}
          role={warning ? "status" : undefined}
        >
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
