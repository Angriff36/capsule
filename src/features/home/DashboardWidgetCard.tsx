import { Link } from "react-router-dom";
import {
  BellIcon,
  BoxIcon,
  CalendarIcon,
  ChartIcon,
  CoinsIcon,
  UsersIcon,
} from "../../ui/icons";
import type {
  DashboardWidgetId,
  DashboardWidgetView,
} from "./DashboardWidgetPolicy";

const WIDGET_ICON: Record<DashboardWidgetId, typeof CalendarIcon> = {
  upcoming_events: CalendarIcon,
  invoice_aging: CoinsIcon,
  low_stock_alerts: BoxIcon,
  staff_schedule_gaps: UsersIcon,
  recent_activity: BellIcon,
  cash_forecast: ChartIcon,
};

export function DashboardWidgetCard({ view }: { view: DashboardWidgetView }) {
  const Icon = WIDGET_ICON[view.id];
  return (
    <article
      className={`dashboard-widget dashboard-widget--${view.tone}`}
      data-widget-id={view.id}
    >
      <div className="dashboard-widget__head">
        <div className="dashboard-widget__glyph" aria-hidden="true">
          <Icon width={18} height={18} />
        </div>
        <div>
          <p className="dashboard-widget__eyebrow">{view.eyebrow}</p>
          <h2>{view.title}</h2>
        </div>
        <span className="dashboard-widget__live">
          <i /> Live
        </span>
      </div>

      <div className="dashboard-widget__metric">
        <strong>{view.metric}</strong>
        <span>{view.metricLabel}</span>
      </div>

      <div className="dashboard-widget__body">
        {view.rows.length === 0 ? (
          <p className="dashboard-widget__empty">{view.emptyMessage}</p>
        ) : (
          <ul>
            {view.rows.map((row, index) => {
              const content = (
                <>
                  <span>
                    <b>{row.label}</b>
                    {row.meta ? <small>{row.meta}</small> : null}
                  </span>
                  {row.value ? <em>{row.value}</em> : null}
                </>
              );
              return (
                <li key={`${row.label}:${index}`}>
                  {row.href ? <Link to={row.href}>{content}</Link> : content}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Link to={view.href} className="dashboard-widget__footer">
        Open {view.title.toLowerCase()} <span aria-hidden="true">↗</span>
      </Link>
    </article>
  );
}
