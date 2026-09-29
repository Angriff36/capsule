import type { Dispatch, SetStateAction } from "react";
import type {
  ActionPromptField,
  ActionPromptRequest,
} from "./ActionPromptTypes";
import { MAX_DATETIME_LOCAL_INPUT_VALUE } from "../BoundedDateInputs";

interface ActionPromptFieldsProps {
  request: ActionPromptRequest;
  idPrefix: string;
  describedBy: string;
  reason: string;
  onReasonChange: (next: string) => void;
  values: Record<string, string>;
  onValuesChange: Dispatch<SetStateAction<Record<string, string>>>;
}

/** Reason textarea or the request's field list, under the description. */
export function ActionPromptFields({
  request,
  idPrefix,
  describedBy,
  reason,
  onReasonChange,
  values,
  onValuesChange,
}: ActionPromptFieldsProps) {
  if (request.kind === "reason") {
    const reasonId = `${idPrefix}-reason`;
    return (
      <div className="grid gap-1">
        <label className="field-label" htmlFor={reasonId}>
          {request.label}
        </label>
        <textarea
          id={reasonId}
          name="reason"
          className="input min-h-20 py-2"
          value={reason}
          required
          aria-describedby={describedBy}
          placeholder={request.placeholder}
          onChange={(event) => onReasonChange(event.target.value)}
        />
      </div>
    );
  }
  if (request.kind !== "fields") return null;
  return (
    <div className="grid gap-3">
      {request.fields.map((field) => (
        <PromptField
          key={field.name}
          field={field}
          fieldId={`${idPrefix}-${field.name}`}
          value={values[field.name] ?? ""}
          onChange={(next) =>
            onValuesChange((current) => ({ ...current, [field.name]: next }))
          }
        />
      ))}
    </div>
  );
}

function PromptField({
  field,
  fieldId,
  value,
  onChange,
}: {
  field: ActionPromptField;
  fieldId: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const helperId = field.helper ? `${fieldId}-helper` : undefined;
  const common = {
    id: fieldId,
    name: field.name,
    value,
    required: field.required ?? true,
    "aria-describedby": helperId,
  };
  return (
    <div className="grid gap-1">
      <label className="field-label" htmlFor={fieldId}>
        {field.label}
      </label>
      {field.helper ? (
        <p id={helperId} className="text-xs text-ink-3">
          {field.helper}
        </p>
      ) : null}
      {field.options ? (
        <select
          {...common}
          className="input"
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{field.placeholder ?? "Select an option"}</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.multiline ? (
        <textarea
          {...common}
          rows={3}
          className="input min-h-20 py-2"
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...common}
          type={field.inputType ?? "text"}
          // Unbounded datetime-local years grow to six digits while typing
          // (issue #148); cap at 9999 so the year commits after four digits.
          max={
            field.inputType === "datetime-local"
              ? MAX_DATETIME_LOCAL_INPUT_VALUE
              : undefined
          }
          className="input"
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
