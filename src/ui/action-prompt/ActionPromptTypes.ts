export type ActionPromptTone = "default" | "danger";

export interface ActionPromptField {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  inputType?: "text" | "number" | "datetime-local";
  required?: boolean;
  helper?: string;
}

export interface ReasonPromptRequest {
  kind: "reason";
  title: string;
  description: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ActionPromptTone;
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
