import { useMemo } from "react";
import {
  useListEvent,
  useListLead,
  useListEventCloseout,
} from "@/lib/manifest-convex-react";
import {
  DashboardGrid,
  type DashboardGridSize,
} from "@/ui/charts/DashboardGrid";
import { StatCard } from "@/ui/charts/StatCard";
import { PageHeader, Section, EmptyState } from "@/ui/primitives";
import { formatMoney } from "@/lib/format";

/**
 * L10 Dashboard (Priority 40)
 *
 * Weekly leadership meeting board: this week's wins and the company
 * scorecard, all derived live from events, leads, and closeouts.
 * Rocks, issues, and to-dos are not tracked in Capsule, so those
 * sections show an honest empty state instead of placeholder data.
 */

export function L10DashboardPage() {
  const events = useListEvent();
  const leads = useListLead();
  const closeouts = useListEventCloseout();

  // This week's wins
  const weeklyWins = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentCompleted = (events || []).filter((e) => {
      if (!e.updatedAt) return false;
      const updated = new Date(e.updatedAt);
      return e.stage === "completed" && updated >= weekAgo && updated <= now;
    });

    const revenueWin = recentCompleted.reduce(
      (sum, e) => sum + (e.quotedPrice || 0),
      0,
    );
    const newLeads = (leads || []).filter((l) => {
      if (!l.createdAt) return false;
      const created = new Date(l.createdAt);
      return created >= weekAgo && created <= now;
    }).length;

    const convertedLeads = (leads || []).filter((l) => {
      if (!l.updatedAt) return false;
      const updated = new Date(l.updatedAt);
      return l.stage === "converted" && updated >= weekAgo && updated <= now;
    }).length;

    return {
      completedEvents: recentCompleted.length,
      revenue: revenueWin,
      newLeads,
      convertedLeads,
    };
  }, [events, leads]);

  // Scorecard metrics (key L10 KPIs)
  const scorecardMetrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthEvents = (events || []).filter((e) => {
      if (!e.startsAt) return false;
      const date = new Date(e.startsAt);
      return (
        date.getMonth() === currentMonth && date.getFullYear() === currentYear
      );
    });

    const monthRevenue = monthEvents.reduce(
      (sum, e) => sum + (e.quotedPrice || 0),
      0,
    );

    const monthCloseouts = (closeouts || []).filter((c) => {
      const ts = c.finalizedAt ?? c.capturedAt ?? c.createdAt;
      if (!ts) return false;
      const date = new Date(ts);
      return (
        date.getMonth() === currentMonth && date.getFullYear() === currentYear
      );
    });

    const totalCost = monthCloseouts.reduce(
      (sum, c) => sum + (c.actualIngredientCost || 0),
      0,
    );
    const totalRev = monthCloseouts.reduce(
      (sum, c) => sum + c.grossProfit + (c.actualIngredientCost || 0),
      0,
    );
    const foodCostPct = totalRev > 0 ? (totalCost / totalRev) * 100 : 0;

    const monthLeads = (leads || []).filter((l) => {
      if (!l.createdAt) return false;
      const date = new Date(l.createdAt);
      return (
        date.getMonth() === currentMonth && date.getFullYear() === currentYear
      );
    });

    return {
      monthlyRevenue: monthRevenue,
      foodCostPct,
      newLeads: monthLeads.length,
      eventsBooked: monthEvents.length,
    };
  }, [events, closeouts, leads]);

  const dashboardItems: Array<{
    id: string;
    size: DashboardGridSize;
    content: React.ReactNode;
    title?: string;
  }> = [
    // Weekly wins
    {
      id: "wins-header",
      size: "full",
      content: (
        <div className="rounded-sm border-2 border-ok/30 bg-ok-soft p-4">
          <h3 className="font-semibold text-ok">This Week's Wins</h3>
          <div className="mt-3 grid grid-cols-4 gap-4">
            <div>
              <p className="text-xl font-bold text-ok">
                {weeklyWins.completedEvents}
              </p>
              <p className="text-xs text-ok">Events Completed</p>
            </div>
            <div>
              <p className="text-xl font-bold text-ok">
                {formatMoney(weeklyWins.revenue)}
              </p>
              <p className="text-xs text-ok">Revenue Booked</p>
            </div>
            <div>
              <p className="text-xl font-bold text-ok">{weeklyWins.newLeads}</p>
              <p className="text-xs text-ok">New Leads</p>
            </div>
            <div>
              <p className="text-xl font-bold text-ok">
                {weeklyWins.convertedLeads}
              </p>
              <p className="text-xs text-ok">Converted</p>
            </div>
          </div>
        </div>
      ),
    },
    // Scorecard metrics
    {
      id: "monthly-revenue-kpi",
      size: "small",
      content: (
        <StatCard
          title="Monthly Revenue"
          main={{
            value: scorecardMetrics.monthlyRevenue,
            format: "currency" as const,
          }}
          rows={[
            {
              label: "Events Booked",
              value: scorecardMetrics.eventsBooked,
              format: "number" as const,
            },
          ]}
          tone="brand"
          isLive
        />
      ),
    },
    {
      id: "food-cost-kpi",
      size: "small",
      content: (
        <StatCard
          title="Food Cost %"
          main={{
            value: scorecardMetrics.foodCostPct,
            format: "percent" as const,
          }}
          isLive
        />
      ),
    },
    {
      id: "leads-kpi",
      size: "small",
      content: (
        <StatCard
          title="New Leads"
          main={{ value: scorecardMetrics.newLeads, format: "number" as const }}
          tone="info"
          isLive
        />
      ),
    },
  ];

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="L10 Meeting Dashboard"
        lead="Live numbers for your weekly leadership meeting: this week's wins and the company scorecard, straight from your events, leads, and closeouts."
      />

      <DashboardGrid items={dashboardItems} />

      <div className="mt-6">
        <Section title="Rocks, issues, and to-dos">
          <EmptyState
            title="Rocks, issues, and to-dos aren't tracked in Capsule."
            hint="This board shows only live numbers from your events, leads, and closeouts. Keep your 90-day priorities, issues list, and meeting to-dos in your meeting notes for now."
          />
        </Section>
      </div>

      {/* L10 Framework Note */}
      <div className="mt-6 rounded-sm border border-line bg-inset p-4">
        <h4 className="text-xs font-semibold text-ink">About L10 Meetings</h4>
        <p className="mt-1 text-xs text-ink-2">
          The L10 is a weekly 90-minute leadership meeting to review the
          business, solve issues, and stay aligned on priorities. Scorecard
          numbers track business health, and wins open the meeting on what went
          right this week.
        </p>
      </div>
    </div>
  );
}
