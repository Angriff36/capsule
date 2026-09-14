import { useEffect, useState } from "react";
import { useCreateServiceStyle } from "../../lib/manifest-convex-react";
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
  const createServiceStyle = useCreateServiceStyle();
  const [busy, setBusy] = useState(false);
  const options = serviceStyleSelectOptions(rows);
  const builtIn = usingBuiltInServiceStyles(rows);
  const resolver = new EventCreateServiceStyleResolver(createServiceStyle);
  const missing = resolver.missing(rows);

  useEffect(() => {
    const live = EventCreateServiceStyleResolver.liveId(value, rows);
    if (live && live !== value) onChange(live);
  }, [onChange, rows, value]);

  const addStandardList = () => {
    setBusy(true);
    void resolver
      .registerMissing(rows)
      .catch(() => undefined)
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
        </div>
      ) : null}
    </div>
  );
}
