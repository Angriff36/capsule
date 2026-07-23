import { useCallback, useRef, useState, type FormEvent } from "react";

// ponytail: leans on the browser's native Constraint Validation API
// (required / min / max / type=email …) instead of a form library. A single
// delegated blur/input listener on the <form> keeps every field uncontrolled,
// so existing FormData submit handlers keep working unchanged.

export type FieldErrors = Record<string, string>;

type Validatable = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isValidatable(el: EventTarget | null): el is Validatable {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  );
}

export function useFieldValidation(
  crossField?: (data: FormData) => FieldErrors,
) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const submitted = useRef(false);

  const collect = useCallback(
    (form: HTMLFormElement): FieldErrors => {
      const next: FieldErrors = {};
      for (const el of Array.from(form.elements)) {
        if (!isValidatable(el) || !el.name || !el.willValidate) continue;
        if (!el.checkValidity()) next[el.name] = el.validationMessage;
      }
      if (crossField) {
        for (const [name, message] of Object.entries(
          crossField(new FormData(form)),
        )) {
          if (message && !next[name]) next[name] = message;
        }
      }
      return next;
    },
    [crossField],
  );

  const handleBlur = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      const target = event.target;
      if (!isValidatable(target) || !target.name) return;
      setTouched((prev) => ({ ...prev, [target.name]: true }));
      setErrors(collect(event.currentTarget));
    },
    [collect],
  );

  const handleInput = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      const target = event.target;
      if (!isValidatable(target) || !target.name) return;
      if (!submitted.current && !touched[target.name]) return;
      setErrors(collect(event.currentTarget));
    },
    [collect, touched],
  );

  const handleSubmit = useCallback(
    (onValid: (event: FormEvent<HTMLFormElement>) => void) =>
      (event: FormEvent<HTMLFormElement>) => {
        submitted.current = true;
        const form = event.currentTarget;
        const found = collect(form);
        if (Object.keys(found).length > 0) {
          event.preventDefault();
          setErrors(found);
          setTouched((prev) => {
            const next = { ...prev };
            for (const name of Object.keys(found)) next[name] = true;
            return next;
          });
          for (const el of Array.from(form.elements)) {
            if (isValidatable(el) && found[el.name]) {
              el.scrollIntoView({ block: "center", behavior: "smooth" });
              el.focus({ preventScroll: true });
              break;
            }
          }
          return;
        }
        setErrors({});
        onValid(event);
      },
    [collect],
  );

  return {
    errors,
    touched,
    formProps: { noValidate: true, onBlur: handleBlur, onInput: handleInput },
    handleSubmit,
  };
}

export function FieldError({
  name,
  errors,
  touched,
}: {
  name: string;
  errors: FieldErrors;
  touched: Record<string, boolean>;
}) {
  const message = errors[name];
  if (!message || !touched[name]) return null;
  return (
    <p role="alert" className="mt-1 text-[11px] font-medium text-danger">
      {message}
    </p>
  );
}
