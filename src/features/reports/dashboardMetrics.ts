import {
  NOT_MONEY,
  QUOTED_TAX,
  type MetricDefinition,
} from "./metricDefinitionTypes";

/**
 * Every figure on the seven dashboards. The pages count with the shared
 * record sets in dashboardRecordSets.ts, so these words and the sums agree.
 */

const PERIOD_BY_START =
  "Event start date; the card or page heading names the period (all time, this month, this week, today).";

const BOOKED_BASE = {
  source: "Events",
  dateBasis: PERIOD_BY_START,
  timeBasis: "device",
  recordBasis: "live",
  includes:
    "Approved events and every later stage (sales lock, executing, final, completed, closed out) that have a quoted price.",
  leftOut:
    "Quotes, planning, waiting-for-approval and cancelled events, and events with no quoted price.",
  drill: "Open the Events list for the records behind this figure.",
} as const;

const COMPLETED_BASE = {
  ...BOOKED_BASE,
  includes: "Completed and closed-out events with a quoted price above $0.",
  leftOut: "Every other stage, and completed events with no quoted price.",
} as const;

const LEAD_BASE = {
  source: "Leads",
  dateBasis:
    "Every lead on file, or the date the lead was made when the card names a period.",
  timeBasis: "device",
  currency: "none",
  tax: NOT_MONEY,
  recordBasis: "live",
  leftOut: "Deleted leads.",
  drill: "Open the sales board for the leads behind this figure.",
} as const;

const CLOSEOUT_BASE = {
  source: "Event closeouts",
  dateBasis:
    "Date the closeout was finished (else captured, else made); the card names the period.",
  timeBasis: "device",
  currency: "none",
  tax: "Revenue = profit plus food cost, as recorded on the closeout.",
  recordBasis: "live",
  drill: "Open Finance > Closeouts for the events behind this figure.",
} as const;

const TODAY_BASE = {
  source: "Events",
  dateBasis: "Event start date, today on this device's clock.",
  timeBasis: "device",
  currency: "none",
  tax: NOT_MONEY,
  recordBasis: "live",
  includes: "Every stage except cancelled.",
  leftOut: "Cancelled events.",
  drill: "Open the Events list for today's events.",
} as const;

const COMMISSION_BASE = {
  source: "Revenue splits",
  timeBasis: "device",
  currency: "company",
  tax: "The amount on the split, already the commission. No rate is applied here.",
  recordBasis: "live",
  includes: "Sales commission splits that are applied and name a salesperson.",
  leftOut: "Draft and retired splits, and splits on cancelled events.",
  drill: "Open Finance > Revenue splits for the records behind this figure.",
} as const;

export const DASHBOARD_METRICS = {
  "dashboard.booked_revenue": {
    ...BOOKED_BASE,
    label: "Booked revenue",
    measures: "Quoted prices of booked events added together.",
    currency: "company",
    tax: QUOTED_TAX,
  },
  "dashboard.booked_events": {
    ...BOOKED_BASE,
    label: "Booked events",
    measures: "How many booked events there are.",
    currency: "none",
    tax: NOT_MONEY,
  },
  "dashboard.booked_average": {
    ...BOOKED_BASE,
    label: "Average event value",
    measures: "Booked revenue divided by the number of booked events.",
    currency: "company",
    tax: QUOTED_TAX,
  },
  "dashboard.commission_basis": {
    ...BOOKED_BASE,
    label: "3% basis",
    measures:
      "Booked revenue of the events a salesperson is assigned to, times 3%. A guide figure; the amount actually owed is the applied split on Comp Master.",
    currency: "company",
    tax: QUOTED_TAX,
    leftOut:
      "Quotes, planning, waiting-for-approval and cancelled events, events with no quoted price, and events with no salesperson.",
  },
  "dashboard.completed_revenue": {
    ...COMPLETED_BASE,
    label: "Completed revenue",
    measures: "Quoted prices of completed events added together.",
    currency: "company",
    tax: QUOTED_TAX,
  },
  "dashboard.completed_events": {
    ...COMPLETED_BASE,
    label: "Completed events",
    measures: "How many completed events there are.",
    currency: "none",
    tax: NOT_MONEY,
  },
  "dashboard.completed_average": {
    ...COMPLETED_BASE,
    label: "Average event value",
    measures: "Completed revenue divided by the number of completed events.",
    currency: "company",
    tax: QUOTED_TAX,
  },
  "dashboard.guests": {
    ...BOOKED_BASE,
    label: "Guests",
    measures:
      "Expected guest counts of the events the card counts, added or averaged.",
    currency: "none",
    includes: "The same events as the revenue figure beside it.",
    leftOut:
      "Events with no guest count are left out of the average, not counted as zero guests.",
    tax: NOT_MONEY,
  },
  "dashboard.revenue_per_guest": {
    ...COMPLETED_BASE,
    label: "Revenue per guest",
    measures: "Revenue divided by guests, for events that have both.",
    currency: "company",
    leftOut: "Events with no guest count.",
    tax: QUOTED_TAX,
  },
  "dashboard.growth_month": {
    ...COMPLETED_BASE,
    label: "Month-on-month growth",
    measures:
      "Change in average event value this calendar month against last month.",
    currency: "none",
    leftOut: "Shows “Not enough history” when either month has no events.",
    tax: QUOTED_TAX,
  },
  "dashboard.growth_year": {
    ...COMPLETED_BASE,
    label: "Year-on-year growth",
    measures:
      "Change in average event value this calendar month against the same month last year.",
    currency: "none",
    leftOut: "Shows “Not enough history” when either month has no events.",
    tax: QUOTED_TAX,
  },
  "dashboard.leads": {
    ...LEAD_BASE,
    label: "Leads",
    measures: "How many leads there are.",
    includes: "Every stage, closed deals included.",
  },
  "dashboard.lead_qualified": {
    ...LEAD_BASE,
    label: "Qualified",
    measures: "Leads that reached qualified or later, divided by all leads.",
    includes:
      "Qualified, proposal sent, negotiating and converted in the top number; every lead in the bottom.",
  },
  "dashboard.lead_conversion": {
    ...LEAD_BASE,
    label: "Lead conversion",
    measures: "Leads that became events divided by all leads.",
    includes: "Converted leads in the top number; every lead in the bottom.",
  },
  "dashboard.food_cost_percent": {
    ...CLOSEOUT_BASE,
    label: "Food cost %",
    measures: "Food cost divided by revenue, across the closeouts counted.",
    includes: "Closeouts with revenue above $0.",
    leftOut:
      "Events with no closeout. With no closeout at all the card says “Not known yet”, never 0%.",
  },
  "dashboard.food_cost_budget": {
    ...CLOSEOUT_BASE,
    label: "Budgeted food cost %",
    measures:
      "Budgeted food cost divided by revenue; the difference from actual is shown in dollars.",
    currency: "company",
    includes: "Closeouts with revenue above $0.",
    leftOut: "Events with no closeout.",
  },
  "dashboard.profit_margin": {
    ...CLOSEOUT_BASE,
    label: "Profit margin",
    measures: "Profit divided by revenue, across the closeouts counted.",
    includes: "Closeouts with revenue above $0.",
    leftOut:
      "Events with no closeout. With no closeout at all the card says “Not known yet”.",
  },
  "dashboard.profitable_share": {
    ...CLOSEOUT_BASE,
    label: "Profitable events",
    measures:
      "Closeouts with a profit above $0, divided by all closeouts; average profit per closeout beside it.",
    includes: "Every closeout.",
    leftOut:
      "Events with no closeout. With no closeout at all the card says “Not known yet”.",
  },
  "dashboard.events_today": {
    ...TODAY_BASE,
    label: "Events today",
    measures: "How many events start today.",
  },
  "dashboard.guests_today": {
    ...TODAY_BASE,
    label: "Guests today",
    measures: "Expected guests at today's events, added together.",
  },
  "dashboard.event_owners_today": {
    ...TODAY_BASE,
    label: "Event owners today",
    measures: "Different people named as owner on today's events.",
  },
  "dashboard.prep_done_today": {
    ...TODAY_BASE,
    source: "Prep tasks",
    dateBasis: "Task due date, today on this device's clock.",
    label: "Prep done today",
    measures: "Prep tasks due today that are done, divided by all due today.",
    includes: "Every prep task due today.",
    leftOut: "Shows “None due today” when no task is due, never 0%.",
    drill: "Open Kitchen > Prep for today's tasks.",
  },
  "dashboard.packs_ready": {
    ...TODAY_BASE,
    source: "Pack lists",
    dateBasis: "Date the pack list was made, today on this device's clock.",
    label: "Pack lists ready",
    measures:
      "Pack lists made today that are packed or sent out, divided by all made today.",
    includes: "Every pack list made today.",
    leftOut: "Shows “None today” when no list was made, never 0%.",
    drill: "Open Logistics > Pack lists.",
  },
  "dashboard.events_completed_week": {
    ...COMPLETED_BASE,
    dateBasis: "Event start date in the last seven days.",
    label: "Events completed this week",
    measures:
      "Completed events that started in the last seven days, and their quoted prices.",
    currency: "company",
    tax: QUOTED_TAX,
  },
  "dashboard.leads_converted_week": {
    ...LEAD_BASE,
    dateBasis: "Date the lead was last changed, in the last seven days.",
    label: "Leads converted this week",
    measures:
      "Leads at converted that were last changed in the last seven days.",
    includes: "Converted leads only.",
  },
  "dashboard.commission_applied": {
    ...COMMISSION_BASE,
    dateBasis: "No period: every applied split.",
    label: "Applied commission",
    measures: "Applied sales commission amounts added together.",
  },
  "dashboard.commission_month": {
    ...COMMISSION_BASE,
    dateBasis: "Date the split was applied, this calendar month.",
    label: "Applied this month",
    measures: "Sales commission applied this calendar month, added together.",
    leftOut:
      "Draft and retired splits, splits on cancelled events, and splits with no applied date.",
  },
  "dashboard.salespeople": {
    ...COMMISSION_BASE,
    dateBasis: "No period: every applied split.",
    label: "Salespeople",
    measures: "Different salespeople with applied commission.",
    currency: "none",
    tax: NOT_MONEY,
  },
} as const satisfies Record<string, MetricDefinition>;
