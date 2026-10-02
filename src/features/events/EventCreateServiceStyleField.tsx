import { useEffect, useState } from "react";
import { useEnsureBuiltInServiceStyle } from "../../lib/eventCreateCatalogClient";
import {
  EventCreateServiceStyleResolver,
  type ListedServiceStyleRow,
} from "./EventCreateServiceStyleResolver";
import {
  serviceStyleSelectOptions,
  usingBuiltInServiceStyles,
} from "./serviceStyleCatalog";

export function EventCreateServiceStyleField({
  value,
  onChange,
  rows,
  form,
}: {
  value: string;
  onChange: (next: string) => void;
  rows: readonly ListedServiceStyleRow[] | undefined;
  form: string;
}) {
  const ensureBuiltInServiceStyle = useEnsureBuiltInServiceStyle();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = serviceStyleSelectOptions(rows);
  const builtIn = usingBuiltInServiceStyles(rows);
  const resolver = new EventCreateServiceStyleResolver(
    ensureBuiltInServiceStyle,
  );
  const missing = resolver.missing(rows);

  useEffect(() => {
    const live = EventCreateServiceStyleResolver.liveId(value, rows);
    if (live && live !== value) onChange(live);
  }, [onChange, rows, value]);

  const addStandardList = () => {
    setBusy(true);
    setError(null);
    void resolver
      .registerMissing(rows)
      .catch((cause: unknown) =>
        setError(
          `Some service styles were not added. Press the button again to add the rest. ${cause instanceof Error ? cause.message : ""}`.trim(),
        ),
      )
      .finally(() => setBusy(false));
  };

  return (
    <div>
      <label className="field-label">
        Service style
        <select
          name="serviceStyleId"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="input"
          form={form}
        >
          <option value="">Select a service style</option>
          {options.map((serviceStyle) => (
            <option key={serviceStyle.id} value={serviceStyle.id}>
              {serviceStyle.name}
            </option>
          ))}
        </select>
      </label>
      {builtIn && missing.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-xs leading-relaxed text-ink-3">
            These names are not in your catalog yet. Add them here so the pick
            saves on the event — Buffet – Cook Onsite, Plated, Family Style, and
            the rest.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm self-start"
            disabled={busy}
            onClick={addStandardList}
          >
            {busy ? "Adding…" : "Add the standard list"}
          </button>
          {error ? (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
