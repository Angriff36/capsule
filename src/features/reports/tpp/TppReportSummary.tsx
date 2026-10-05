import type { TppReportSummary as Summary } from "./reportSummary";

/** The run's choices, time and row count, then any missing-row notices. */
export function TppReportSummary({
  summary,
  notices,
}: {
  summary?: Summary;
  notices: readonly string[];
}) {
  return (
    <>
      {summary ? (
        <dl className="tpp-run-summary">
          {summary.choices.map((choice) => (
            <div key={choice.label}>
              <dt>{choice.label}</dt>
              <dd>{choice.value}</dd>
            </div>
          ))}
          <div>
            <dt>Run at</dt>
            <dd>{summary.ranAt}</dd>
          </div>
          <div>
            <dt>Rows</dt>
            <dd>{summary.rowCount.toLocaleString("en-US")}</dd>
          </div>
        </dl>
      ) : null}
      {notices.map((notice) => (
        <p key={notice} className="live-report-notice" role="status">
          {notice}
        </p>
      ))}
    </>
  );
}
