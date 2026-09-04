import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../lib/api";
import { downloadTppCsv, downloadTppExcel } from "./exports";
import { parseTppReportRequest } from "./request";
import {
  TppReportParameters,
  type TppReportOptions,
} from "./TppReportParameters";
import { TppReportResult } from "./TppReportResult";
import type {
  TppReportDefinition,
  TppReportRequest,
  TppReportResult as Result,
} from "./types";

export function TppReportRunner({
  definition,
  options,
  onClose,
}: {
  definition: TppReportDefinition;
  options: TppReportOptions;
  onClose: () => void;
}) {
  const [request, setRequest] = useState<TppReportRequest | null>(null);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const args = request
    ? { reportId: request.reportId, parameters: request.parameters }
    : "skip";
  const contacts = useQuery(
    api.tppReports.contacts.run,
    definition.category === "contacts" ? args : "skip",
  );
  const event = useQuery(
    api.tppReports.events.run,
    definition.category === "event" ? args : "skip",
  );
  const financial = useQuery(
    api.tppReports.financial.run,
    definition.category === "financial" ? args : "skip",
  );
  const general = useQuery(
    api.tppReports.general.run,
    definition.category === "tpp_general" ? args : "skip",
  );
  const result = (
    definition.category === "contacts"
      ? contacts
      : definition.category === "event"
        ? event
        : definition.category === "financial"
          ? financial
          : general
  ) as Result | undefined;

  useEffect(() => {
    setRequest(null);
    setErrors({});
  }, [definition.id]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseTppReportRequest(
      definition,
      new FormData(event.currentTarget),
    );
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setRequest(parsed.request);
  };
  const filename = definition.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return (
    <section className="tpp-runner" aria-labelledby="tpp-runner-title">
      <header className="tpp-runner-heading">
        <div>
          <p className="live-report-eyebrow">
            {definition.category.replace("tpp_general", "TPP General")}
          </p>
          <h2 id="tpp-runner-title">{definition.name}</h2>
          <p>
            {definition.description || "Total Party Planner compatible report."}
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <TppReportParameters
        definition={definition}
        options={options}
        errors={errors}
        onSubmit={submit}
      />
      {request && result === undefined ? (
        <div className="tpp-result-status" role="status">
          Running report…
        </div>
      ) : null}
      {result ? (
        <>
          <div className="tpp-output-bar">
            <strong>{result.title}</strong>
            <div>
              {definition.outputs.includes("print") ? (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => window.print()}
                >
                  Print
                </button>
              ) : null}
              {definition.outputs.includes("pdf") ? (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => window.print()}
                >
                  Save PDF
                </button>
              ) : null}
              {definition.outputs.includes("csv") ? (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => downloadTppCsv(result, filename)}
                >
                  CSV
                </button>
              ) : null}
              {definition.outputs.includes("excel") ? (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => downloadTppExcel(result, filename)}
                >
                  Excel
                </button>
              ) : null}
              {definition.outputs.includes("labels") ? (
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  onClick={() => window.print()}
                >
                  Print labels
                </button>
              ) : null}
            </div>
          </div>
          <TppReportResult result={result} />
        </>
      ) : null}
    </section>
  );
}
