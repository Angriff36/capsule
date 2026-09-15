import type { FormEvent } from "react";
import { BoundedDateInput } from "../../../ui/BoundedDateInputs";
import { useWorkingEventId } from "../../events/workingEvent";
import type { TppReportDefinition, TppReportOption } from "./types";

export interface TppReportOptions {
  events: readonly TppReportOption[];
  clients: readonly TppReportOption[];
  people: readonly TppReportOption[];
  vendors: readonly TppReportOption[];
  venues: readonly TppReportOption[];
}

function dateValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function entityOptions(
  entity: string,
  options: TppReportOptions,
): readonly TppReportOption[] {
  if (entity === "event") return options.events;
  if (entity === "client") return options.clients;
  if (entity === "person") return options.people;
  if (entity === "vendor") return options.vendors;
  return options.venues;
}

export function TppReportParameters({
  definition,
  options,
  errors,
  onSubmit,
}: {
  definition: TppReportDefinition;
  options: TppReportOptions;
  errors: Readonly<Record<string, string>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const workingEventId = useWorkingEventId();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return (
    <form className="tpp-parameter-form" onSubmit={onSubmit}>
      {definition.parameters.length === 0 ? (
        <p className="tpp-parameter-hint">This report is ready to run.</p>
      ) : (
        <div className="tpp-parameter-grid">
          {definition.parameters.map((parameter) => {
            if (parameter.type === "date_range") {
              return (
                <fieldset className="tpp-date-range" key={parameter.key}>
                  <legend>{parameter.label}</legend>
                  <label>
                    <span>From</span>
                    <BoundedDateInput
                      className="input"
                      name={`${parameter.key}Start`}
                      defaultValue={dateValue(
                        parameter.default === "today" ? now : monthStart,
                      )}
                    />
                  </label>
                  <label>
                    <span>Through</span>
                    <BoundedDateInput
                      className="input"
                      name={`${parameter.key}End`}
                      defaultValue={dateValue(
                        parameter.default === "today" ? now : monthEnd,
                      )}
                    />
                  </label>
                  {errors[parameter.key] ? (
                    <small className="field-error">
                      {errors[parameter.key]}
                    </small>
                  ) : null}
                </fieldset>
              );
            }
            if (parameter.type === "date") {
              const defaultDate =
                parameter.default === "month_start"
                  ? monthStart
                  : parameter.default === "month_end"
                    ? monthEnd
                    : now;
              return (
                <label key={parameter.key}>
                  <span>{parameter.label}</span>
                  <BoundedDateInput
                    className="input"
                    name={parameter.key}
                    defaultValue={dateValue(defaultDate)}
                  />
                  {errors[parameter.key] ? (
                    <small className="field-error">
                      {errors[parameter.key]}
                    </small>
                  ) : null}
                </label>
              );
            }
            if (parameter.type === "boolean") {
              return (
                <label className="tpp-checkbox" key={parameter.key}>
                  <input
                    type="checkbox"
                    name={parameter.key}
                    defaultChecked={parameter.default}
                  />
                  <span>{parameter.label}</span>
                </label>
              );
            }
            if (parameter.type === "text") {
              return (
                <label className="tpp-parameter-wide" key={parameter.key}>
                  <span>{parameter.label}</span>
                  <textarea
                    className="input"
                    name={parameter.key}
                    rows={5}
                    required={parameter.required}
                  />
                  {errors[parameter.key] ? (
                    <small className="field-error">
                      {errors[parameter.key]}
                    </small>
                  ) : null}
                </label>
              );
            }
            const values =
              parameter.type === "enum"
                ? parameter.options
                : entityOptions(parameter.entity, options);
            // An event report starts on the working event when it is listed.
            const eventDefault =
              parameter.type === "entity" &&
              parameter.entity === "event" &&
              workingEventId &&
              values.some(
                (option) => "id" in option && option.id === workingEventId,
              )
                ? workingEventId
                : "";
            return (
              <label key={parameter.key}>
                <span>{parameter.label}</span>
                <select
                  // Remount once options load so the default can apply.
                  key={values.length > 0 ? "ready" : "loading"}
                  className="input"
                  name={parameter.key}
                  required={parameter.required}
                  multiple={parameter.multiple}
                  defaultValue={
                    parameter.multiple
                      ? eventDefault
                        ? [eventDefault]
                        : []
                      : eventDefault
                  }
                >
                  <option value="">
                    {parameter.required
                      ? `Choose ${parameter.label.toLowerCase()}`
                      : `All ${parameter.label.toLowerCase()}`}
                  </option>
                  {values.map((option) => {
                    const value = "value" in option ? option.value : option.id;
                    return (
                      <option key={value} value={value}>
                        {option.label}
                      </option>
                    );
                  })}
                </select>
                {errors[parameter.key] ? (
                  <small className="field-error">{errors[parameter.key]}</small>
                ) : null}
              </label>
            );
          })}
        </div>
      )}
      <button className="btn btn-primary" type="submit">
        Run report
      </button>
    </form>
  );
}
