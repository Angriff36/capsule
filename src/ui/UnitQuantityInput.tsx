import { useEffect, useId, useRef, useState } from "react";
import {
  convertQuantity,
  convertibleUnits,
  formatQuantity,
  parseQuantityText,
  quantityEquivalents,
  unitLabel,
} from "../lib/unitQuantity";

interface UnitQuantityInputProps {
  /** Hidden field that submits the amount in the stored unit. */
  name?: string;
  /**
   * Fixed mode (no `unitName`): the unit the record stores; entries in any
   * convertible unit are converted to it. Free mode: the starting unit.
   */
  storeUnit: string;
  /** Free mode: the chosen unit submits under this name, unconverted. */
  unitName?: string;
  /** Free mode: units offered in the suffix picker. */
  units?: readonly string[];
  defaultAmount?: number | string;
  /** Upper bound in the stored unit. */
  max?: number;
  /** Accept 0 (a recount of an empty shelf). */
  allowZero?: boolean;
  required?: boolean;
  id?: string;
  /** Name on the visible box (the typed text), for callers that read it. */
  entryName?: string;
  "aria-describedby"?: string;
  /** Amount in the stored unit (null while invalid) and the stored unit. */
  onChange?: (amount: number | null, unit: string) => void;
}

/**
 * Quantity box with a unit suffix picker. Typing "2 lb" switches the picker;
 * the line underneath shows "= 32 oz / 907 g" so nobody converts by hand.
 */
export function UnitQuantityInput({
  name,
  storeUnit,
  unitName,
  units,
  defaultAmount,
  max,
  allowZero = false,
  required = true,
  id,
  entryName,
  "aria-describedby": describedBy,
  onChange,
}: UnitQuantityInputProps) {
  const free = unitName != null;
  const options = free ? (units ?? [storeUnit]) : convertibleUnits(storeUnit);
  const [text, setText] = useState(
    defaultAmount == null ? "" : String(defaultAmount),
  );
  const [unit, setUnit] = useState(storeUnit);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

  // Free mode: a reset form or a new row brings a new starting unit.
  useEffect(() => setUnit(storeUnit), [storeUnit]);

  const parsed = parseQuantityText(text);
  const enteredUnit = parsed?.unit ?? unit;
  const target = free ? enteredUnit : storeUnit;
  const stored =
    parsed == null ? null : convertQuantity(parsed.amount, enteredUnit, target);
  const error =
    text.trim() === ""
      ? ""
      : parsed == null
        ? "Enter a number, optionally with a unit like 2 lb or 1 1/2 cup."
        : !options.includes(enteredUnit) || stored == null
          ? free
            ? "Pick a unit from the list."
            : `${unitLabel(enteredUnit)} does not convert to ${unitLabel(storeUnit)}.`
          : stored < 0 || (!allowZero && stored === 0)
            ? allowZero
              ? "Enter zero or more."
              : "Enter an amount above zero."
            : max != null && stored > max + 1e-9
              ? `That is more than the ${formatQuantity(max)} ${unitLabel(storeUnit)} on hand.`
              : "";
  const valid = error === "" && stored != null;
  const equivalents = valid
    ? quantityEquivalents(parsed!.amount, enteredUnit, target)
    : [];

  useEffect(() => {
    inputRef.current?.setCustomValidity(error);
  }, [error]);

  useEffect(() => {
    onChange?.(valid ? stored : null, target);
    // onChange is a caller callback; rerun only when the value changes.
  }, [valid, stored, target]);

  const chooseUnit = (next: string) => {
    // Keep the typed number; drop a typed unit word so the picker wins.
    if (parsed?.unit) setText(formatQuantity(parsed.amount));
    setUnit(next);
  };

  return (
    <span className="unit-quantity">
      <span className="unit-quantity-row">
        <input
          ref={inputRef}
          id={id}
          name={entryName}
          className="input"
          inputMode="decimal"
          autoComplete="off"
          required={required}
          value={text}
          aria-describedby={[describedBy, hintId].filter(Boolean).join(" ")}
          aria-invalid={error ? true : undefined}
          onChange={(event) => setText(event.currentTarget.value)}
        />
        {options.length > 1 ? (
          <select
            className="input unit-quantity-unit"
            aria-label="Unit"
            name={unitName}
            value={enteredUnit}
            onChange={(event) => chooseUnit(event.currentTarget.value)}
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {unitLabel(option)}
              </option>
            ))}
          </select>
        ) : (
          <span className="unit-quantity-suffix">
            {unitLabel(enteredUnit)}
            {unitName ? (
              <input type="hidden" name={unitName} value={enteredUnit} />
            ) : null}
          </span>
        )}
      </span>
      {name ? (
        <input type="hidden" name={name} value={valid ? String(stored) : ""} />
      ) : null}
      <span id={hintId} className="unit-quantity-hint" aria-live="polite">
        {error ||
          (equivalents.length
            ? `= ${equivalents.join(" / ")}${
                !free && enteredUnit !== storeUnit
                  ? " (saved in " + unitLabel(storeUnit) + ")"
                  : ""
              }`
            : "")}
      </span>
    </span>
  );
}
