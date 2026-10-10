import type { FieldHelpTerm } from "../fieldHelpTerms";

export type ActionPromptTone = "default" | "danger";

export interface ActionPromptField {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  inputType?: "text" | "number" | "datetime-local";
  /** Render a textarea instead of a single-line input (free-text notes). */
  multiline?: boolean;
  /** When present the field renders as a select over these options. */
  options?: Array<{ value: string; label: string }>;
  /** Words offered while typing; other words are still allowed. */
  suggestions?: string[];
  required?: boolean;
  /**
   * Quantity stored in this unit: renders a unit picker that converts any
   * matching unit (lb, oz, g…) and returns the amount in this unit.
   */
  unit?: string;
  /** With `unit`: accept zero. */
  allowZero?: boolean;
  helper?: string;
  /** Domain term explained by an info icon beside the label. */
  help?: FieldHelpTerm;
}

export interface ReasonPromptRequest {
  kind: "reason";
  title: string;
  description: string;
  label: string;
  placeholder?: string;
  /** Text the box starts with; the user can change it. */
  defaultReason?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ActionPromptTone;
  /** Domain term explained beside the reason label. */
  help?: FieldHelpTerm;
}

export interface ConfirmPromptRequest {
  kind: "confirm";
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ActionPromptTone;
}

export interface FieldsPromptRequest {
  kind: "fields";
  title: string;
  description: string;
  fields: ActionPromptField[];
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ActionPromptTone;
}

export type ActionPromptRequest =
  ReasonPromptRequest | ConfirmPromptRequest | FieldsPromptRequest;

export type ActionPromptResult =
  | { status: "confirmed"; reason?: string; values?: Record<string, string> }
  | { status: "dismissed" };
