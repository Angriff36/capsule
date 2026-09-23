import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import { parseTppReportRequest } from "../reports/tpp/request";
import { TppReportResult } from "../reports/tpp/TppReportResult";
import type {
  TppReportDefinition,
  TppReportRequest,
  TppReportResult as Result,
} from "../reports/tpp/types";
import { DAY_MS, startOfDay, type CalendarEventFacts } from "./homeCalendar";

function localDateInput(ms: number): string {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * The same request the Reports catalog would build for this report, with the
 * event already chosen and any date range pinned to the event's day. Uses the
 * catalog parser so the rail can never send a shape the loaders do not know.
 */
export function eventReportRequest(
  definition: TppReportDefinition,
  event: Pick<CalendarEventFacts, "id" | "startsAt" | "endsAt">,
): TppReportRequest | null {
  const form = new FormData();
  const day = startOfDay(event.startsAt ?? Date.now());
  for (const parameter of definition.parameters) {
    if (parameter.type === "date_range") {
      form.set(`${parameter.key}Start`, localDateInput(day));
      form.set(
        `${parameter.key}End`,
        localDateInput(
          event.endsAt != null && event.endsAt > day + DAY_MS
            ? event.endsAt
            : day,
        ),
      );
    } else if (parameter.type === "date") {
      form.set(parameter.key, localDateInput(day));
    } else if (parameter.type === "boolean" && parameter.default) {
      // The parser reads booleans as "is the box ticked"; keep the catalog default.
      form.set(parameter.key, "on");
    }
  }
  const parsed = parseTppReportRequest(definition, form, new Date(), event.id);
  return parsed.ok ? parsed.request : null;
}

/**
 * Prints the rail's report as the one sheet on the paper. The class on <html>
 * is the print stylesheet's signal that THIS print belongs to the rail, so a
 * page's own print never drags the rail's sheet onto its paper (issue #374
 * item 3).
 */
function printRailReport() {
  const root = document.documentElement;
  root.classList.add("home-report-printing");
  window.addEventListener(
    "afterprint",
    () => root.classList.remove("home-report-printing"),
    { once: true },
  );
  window.print();
}

/**
 * Renders one event report inline and, when asked, sends it to the printer as
 * soon as the rows arrive. The print stylesheet only shows `.print-sheet`, so
 * the rest of the calendar stays out of the paper.
 */
export function EventReportView({
  definition,
  event,
  autoPrint,
  onBack,
}: {
  definition: TppReportDefinition;
  event: Pick<CalendarEventFacts, "id" | "startsAt" | "endsAt">;
  autoPrint: boolean;
  onBack: () => void;
}) {
  const request = useMemo(
    () => eventReportRequest(definition, event),
    [definition, event],
  );
  const args = request
    ? { reportId: request.reportId, parameters: request.parameters }
    : "skip";
  const contacts = useQuery(
    api.tppReports.contacts.run,
    definition.category === "contacts" ? args : "skip",
  );
  const eventResult = useQuery(
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
        ? eventResult
        : definition.category === "financial"
          ? financial
          : general
  ) as Result | undefined;

  // An empty result renders outside `.print-sheet`, so printing it gives a
  // blank page; only print when there is something on the sheet.
  const printable =
    result != null &&
    (result.kind === "document"
      ? result.sections.length
      : result.kind === "labels"
        ? result.labels.length
        : result.rows.length) > 0;

  const printedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!autoPrint || !printable) return;
    const key = `${definition.id}:${event.id}`;
    if (printedFor.current === key) return;
    // Mark only when the dialog actually opens: Strict Mode runs effect,
    // cleanup, effect, and a mark set up front would swallow the print.
    const timer = window.setTimeout(() => {
      printedFor.current = key;
      printRailReport();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [autoPrint, definition.id, event.id, printable]);

  // Drop the print tag if the rail unmounts before the browser fires
  // afterprint, so a later page print cannot pull the rail's sheet along.
  useEffect(
    () => () => {
      document.documentElement.classList.remove("home-report-printing");
    },
    [],
  );

  return (
    <div className="home-report-view">
      <div className="home-report-view-bar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          ← Reports
        </button>
        <strong>{definition.name}</strong>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!printable}
          onClick={printRailReport}
        >
          Print
        </button>
      </div>
      {!request ? (
        <p className="home-report-note">
          This report needs a parameter the rail cannot fill. Open it from
          Reports.
        </p>
      ) : result === undefined ? (
        <p className="home-report-note" role="status">
          Running report…
        </p>
      ) : (
        <TppReportResult result={result} />
      )}
    </div>
  );
}
