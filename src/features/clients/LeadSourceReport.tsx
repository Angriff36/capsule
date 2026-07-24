import { useMemo } from "react";

// Revenue + conversion rate by acquisition source, derived entirely from the
// captured lead list (source, estimatedValue, convertedAt). Read-side view is
// computed client-side — no stored aggregate, no manifest change.
interface SourceLead {
  source: string;
  estimatedValue: number;
  convertedAt?: number | null;
}

interface SourceRow {
  source: string;
  count: number;
  converted: number;
  pipelineValue: number;
  wonValue: number;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

export function LeadSourceReport({ leads }: { leads: SourceLead[] }) {
  const rows = useMemo<SourceRow[]>(() => {
    const map = new Map<string, SourceRow>();
    for (const lead of leads) {
      const source = lead.source?.trim() || "Unspecified";
      const row = map.get(source) ?? {
        source,
        count: 0,
        converted: 0,
        pipelineValue: 0,
        wonValue: 0,
      };
      const value = Number(lead.estimatedValue || 0);
      row.count += 1;
      row.pipelineValue += value;
      if (lead.convertedAt != null) {
        row.converted += 1;
        row.wonValue += value;
      }
      map.set(source, row);
    }
    return [...map.values()].sort(
      (a, b) => b.wonValue - a.wonValue || b.count - a.count,
    );
  }, [leads]);

  if (rows.length === 0) return null;

  return (
    <section
      className="lead-source-report"
      aria-label="Acquisition source performance"
    >
      <header>
        <div>
          <p className="eyebrow">Marketing · Attribution</p>
          <h2>Performance by source</h2>
        </div>
        <p>
          Where the pipeline comes from and which channels actually convert — to
          guide where marketing spend goes.
        </p>
      </header>
      <table>
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Leads</th>
            <th scope="col">Converted</th>
            <th scope="col">Conversion</th>
            <th scope="col">Pipeline value</th>
            <th scope="col">Won value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.source} data-testid={`source-row-${row.source}`}>
              <th scope="row">{row.source}</th>
              <td>{row.count}</td>
              <td>{row.converted}</td>
              <td data-testid={`source-conversion-${row.source}`}>
                {percent.format(
                  row.count === 0 ? 0 : row.converted / row.count,
                )}
              </td>
              <td>{currency.format(row.pipelineValue)}</td>
              <td>{currency.format(row.wonValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <small>
        Won value is the estimated value of converted leads per source.
      </small>
    </section>
  );
}
