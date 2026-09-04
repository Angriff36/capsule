import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../lib/api";
import {
  TPP_CATEGORY_LABELS,
  TPP_DEFAULT_FAVORITES,
  TPP_REPORT_BY_ID,
  TPP_REPORT_CATALOG,
} from "./catalog";
import { TppReportRunner } from "./TppReportRunner";
import type { TppReportCategory, TppReportDefinition } from "./types";

const CATEGORIES: readonly TppReportCategory[] = [
  "contacts",
  "event",
  "financial",
  "tpp_general",
];

export function TppReportCatalog() {
  const stored = useQuery(api.tppReportFavorites.listMine, {});
  const options = useQuery(api.tppReports.options.list, {});
  const setFavorite = useMutation(api.tppReportFavorites.setFavorite);
  const [selected, setSelected] = useState<TppReportDefinition | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const favorites = useMemo(
    () =>
      new Set(stored?.initialized ? stored.reportIds : TPP_DEFAULT_FAVORITES),
    [stored],
  );
  const toggle = async (reportId: string) => {
    if (pending.has(reportId)) return;
    setPending((current) => new Set(current).add(reportId));
    try {
      await setFavorite({ reportId, favorite: !favorites.has(reportId) });
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(reportId);
        return next;
      });
    }
  };
  const favoriteReports = TPP_DEFAULT_FAVORITES.map((id) =>
    TPP_REPORT_BY_ID.get(id),
  )
    .filter(
      (report): report is TppReportDefinition =>
        !!report && favorites.has(report.id),
    )
    .concat(
      TPP_REPORT_CATALOG.filter(
        (report) =>
          favorites.has(report.id) &&
          !TPP_DEFAULT_FAVORITES.includes(report.id as never),
      ),
    );
  const usableOptions = options ?? {
    events: [],
    clients: [],
    people: [],
    vendors: [],
    venues: [],
  };
  return (
    <div className="operations-stage supply-stage tpp-report-page">
      <header className="supply-masthead">
        <div>
          <p className="live-report-eyebrow">Total Party Planner reports</p>
          <h1 className="display-title">Reports</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            The complete TPP report library, using current Capsule records.
            Choose a report, set its filters, then print or export the result.
          </p>
        </div>
        <span className="tpp-report-count">89 reports</span>
      </header>
      {selected ? (
        <TppReportRunner
          definition={selected}
          options={usableOptions}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {favoriteReports.length ? (
        <CatalogSection
          title="Favorites"
          reports={favoriteReports}
          favorites={favorites}
          pending={pending}
          onSelect={setSelected}
          onToggle={toggle}
        />
      ) : null}
      {CATEGORIES.map((category) => (
        <CatalogSection
          key={category}
          title={TPP_CATEGORY_LABELS[category]}
          reports={TPP_REPORT_CATALOG.filter(
            (report) => report.category === category,
          )}
          favorites={favorites}
          pending={pending}
          onSelect={setSelected}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}

function CatalogSection({
  title,
  reports,
  favorites,
  pending,
  onSelect,
  onToggle,
}: {
  title: string;
  reports: readonly TppReportDefinition[];
  favorites: Set<string>;
  pending: Set<string>;
  onSelect: (report: TppReportDefinition) => void;
  onToggle: (reportId: string) => void;
}) {
  return (
    <section
      className="tpp-catalog-section"
      aria-labelledby={`tpp-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="tpp-section-heading">
        <h2 id={`tpp-${title.toLowerCase().replace(/\s+/g, "-")}`}>{title}</h2>
        <span>{reports.length}</span>
      </div>
      <div className="tpp-card-grid">
        {reports.map((report) => (
          <article className="tpp-report-card" key={report.id}>
            <button
              className="tpp-report-open"
              type="button"
              onClick={() => onSelect(report)}
            >
              <strong>{report.name}</strong>
              <span>{report.description || "Total Party Planner report"}</span>
            </button>
            <button
              className="tpp-favorite"
              type="button"
              aria-label={`${favorites.has(report.id) ? "Remove" : "Add"} ${report.name} ${favorites.has(report.id) ? "from" : "to"} favorites`}
              aria-pressed={favorites.has(report.id)}
              disabled={pending.has(report.id)}
              onClick={() => void onToggle(report.id)}
            >
              {favorites.has(report.id) ? "★" : "☆"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
