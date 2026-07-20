import type { FormEvent } from "react";

export const REPORT_SUBJECT_AREAS = [
  "events",
  "sales",
  "inventory",
  "production",
  "workforce",
  "logistics",
  "finance",
] as const;

export const REPORT_CHART_TYPES = ["table", "bar", "line", "pie"] as const;

export const REPORT_SHARING_SCOPES = [
  "owner_only",
  "team",
  "tenant_wide",
] as const;

export type ReportSubjectArea = (typeof REPORT_SUBJECT_AREAS)[number];
export type ReportChartType = (typeof REPORT_CHART_TYPES)[number];
export type ReportSharingScope = (typeof REPORT_SHARING_SCOPES)[number];

/** Builds a SavedReportDefinition.createDefinition payload from the create form. */
export class ReportCreatePayloadBuilder {
  fromForm(data: FormData) {
    const name = String(data.get("name") || "").trim();
    const subjectArea = String(data.get("subjectArea") || "").trim();
    const chartType = String(data.get("chartType") || "").trim();
    const sharingScope = String(
      data.get("sharingScope") || "owner_only",
    ).trim();
    const notes = String(data.get("notes") || "").trim();
    if (!name) throw new Error("Report name is required.");
    if (!REPORT_SUBJECT_AREAS.includes(subjectArea as ReportSubjectArea)) {
      throw new Error("Select a subject area.");
    }
    if (!REPORT_CHART_TYPES.includes(chartType as ReportChartType)) {
      throw new Error("Select a chart type.");
    }
    if (!REPORT_SHARING_SCOPES.includes(sharingScope as ReportSharingScope)) {
      throw new Error("Select a sharing scope.");
    }
    return {
      name,
      subjectArea: subjectArea as ReportSubjectArea,
      chartType,
      sharingScope: sharingScope as ReportSharingScope,
      definition: {
        version: 1,
        notes: notes || undefined,
      },
    };
  }
}

export function ReportCreateForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className="mt-4 space-y-3 border border-line bg-panel p-4"
      onSubmit={onSubmit}
    >
      <p className="text-[13px] text-ink-2">
        Save a governed report definition. Result rendering stays deferred —
        this library only stores configuration you can rename, share, archive,
        and restore.
      </p>
      <label className="block space-y-1">
        <span className="text-[12px] text-ink-3">Name</span>
        <input
          name="name"
          required
          className="input w-full"
          placeholder="Weekly event load"
          disabled={busy}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-[12px] text-ink-3">Subject area</span>
          <select
            name="subjectArea"
            className="input w-full"
            defaultValue="events"
            disabled={busy}
          >
            {REPORT_SUBJECT_AREAS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] text-ink-3">Chart type</span>
          <select
            name="chartType"
            className="input w-full"
            defaultValue="table"
            disabled={busy}
          >
            {REPORT_CHART_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] text-ink-3">Sharing</span>
          <select
            name="sharingScope"
            className="input w-full"
            defaultValue="owner_only"
            disabled={busy}
          >
            {REPORT_SHARING_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {scope.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-[12px] text-ink-3">
          Notes (stored in definition)
        </span>
        <input
          name="notes"
          className="input w-full"
          placeholder="Optional UI notes"
          disabled={busy}
        />
      </label>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save definition"}
      </button>
    </form>
  );
}
