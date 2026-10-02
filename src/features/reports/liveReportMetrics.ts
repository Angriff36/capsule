import {
  NOT_MONEY,
  QUOTED_TAX,
  type MetricDefinition,
} from "./metricDefinitionTypes";

const EVIDENCE = "The rows under Evidence, or Open source workspace.";

const EVENT_BASE = {
  source: "Events",
  dateBasis:
    "Event start date (the date the event was made when no start date is set).",
  timeBasis: "device",
  recordBasis: "live",
  drill: EVIDENCE,
} as const;

const PROPOSAL_BASE = {
  source: "Proposals",
  dateBasis:
    "Event date on the proposal, else the date it was sent, else the date it was made.",
  timeBasis: "device",
  recordBasis: "live",
  drill: EVIDENCE,
} as const;

const PROPOSAL_TAX =
  "The proposal total as shown to the client, tax and service charge included.";

const COUNT_BASE = {
  timeBasis: "device",
  currency: "none",
  tax: NOT_MONEY,
  recordBasis: "live",
  drill: EVIDENCE,
} as const;

const DEMAND_BASE = {
  ...COUNT_BASE,
  source: "Ingredient demand lines",
  dateBasis: "Purchasing week, else the date confirmed or worked out.",
  leftOut: "Deleted lines.",
} as const;

const PREP_BASE = {
  ...COUNT_BASE,
  source: "Prep tasks",
  dateBasis: "Due date, else the date finished or made.",
  leftOut: "Deleted tasks.",
} as const;

const SHIFT_BASE = {
  ...COUNT_BASE,
  source: "Shifts",
  dateBasis: "Shift start.",
  leftOut: "Deleted shifts. Pay rates and labor cost are never shown here.",
} as const;

const DELIVERY_BASE = {
  ...COUNT_BASE,
  source: "Deliveries",
  dateBasis: "Delivery window start, else the scheduled time.",
  leftOut: "Deleted deliveries.",
} as const;

const INVOICE_BASE = {
  source: "Invoices",
  dateBasis: "Issue date, else the due date.",
  timeBasis: "device",
  currency: "company",
  recordBasis: "live",
  tax: "Invoice totals include the tax and service charge on the invoice.",
  drill: EVIDENCE,
} as const;

/** Every KPI the saved live reports show (liveReportBuilders.ts). */
export const LIVE_REPORT_METRICS = {
  "events.count": {
    ...EVENT_BASE,
    label: "Events",
    measures: "How many events fall in the period.",
    currency: "none",
    includes: "Every stage, cancelled included.",
    leftOut: "Deleted events.",
    tax: NOT_MONEY,
  },
  "events.expected_guests": {
    ...EVENT_BASE,
    label: "Expected guests",
    measures: "Expected guest counts added together.",
    currency: "none",
    includes: "Every stage, cancelled included.",
    leftOut: "Deleted events. An event with no guest count adds nothing.",
    tax: NOT_MONEY,
  },
  "events.quoted_revenue": {
    ...EVENT_BASE,
    label: "Quoted revenue",
    measures: "Quoted prices added together.",
    currency: "company",
    includes: "Every stage, cancelled included.",
    leftOut: "Deleted events. An event with no quoted price adds nothing.",
    tax: QUOTED_TAX,
  },
  "events.average_quoted": {
    ...EVENT_BASE,
    label: "Average quoted value",
    measures: "Quoted revenue divided by the number of events.",
    currency: "company",
    includes: "Every stage, cancelled included.",
    leftOut: "Deleted events.",
    tax: QUOTED_TAX,
  },
  "sales.proposals": {
    ...PROPOSAL_BASE,
    label: "Proposals",
    measures: "How many proposals fall in the period.",
    currency: "none",
    includes: "Every status.",
    leftOut: "Deleted proposals.",
    tax: NOT_MONEY,
  },
  "sales.proposed_value": {
    ...PROPOSAL_BASE,
    label: "Proposed value",
    measures: "Proposal totals added together.",
    currency: "company",
    includes: "Every status.",
    leftOut: "Deleted proposals.",
    tax: PROPOSAL_TAX,
  },
  "sales.accepted_value": {
    ...PROPOSAL_BASE,
    label: "Accepted value",
    measures: "Totals of accepted proposals added together.",
    currency: "company",
    includes: "Accepted proposals only.",
    leftOut: "Deleted proposals and every other status.",
    tax: PROPOSAL_TAX,
  },
  "sales.acceptance_rate": {
    ...PROPOSAL_BASE,
    label: "Acceptance rate",
    measures: "Accepted proposals divided by all proposals in the period.",
    currency: "none",
    includes: "Every status in the bottom number; accepted in the top.",
    leftOut: "Deleted proposals.",
    tax: NOT_MONEY,
  },
  "inventory.demand_lines": {
    ...DEMAND_BASE,
    label: "Demand lines",
    measures: "How many demand lines fall in the period.",
    includes: "Every status.",
  },
  "inventory.confirmed": {
    ...DEMAND_BASE,
    label: "Confirmed",
    measures: "Demand lines that are confirmed.",
    includes: "Confirmed only.",
  },
  "inventory.fulfilled": {
    ...DEMAND_BASE,
    label: "Fulfilled",
    measures: "Demand lines that are fulfilled.",
    includes: "Fulfilled only.",
  },
  "inventory.unresolved": {
    ...DEMAND_BASE,
    label: "Unresolved",
    measures: "Demand lines still waiting on purchasing.",
    includes: "Every status except fulfilled and replaced.",
  },
  "production.tasks": {
    ...PREP_BASE,
    label: "Tasks",
    measures: "How many prep tasks fall in the period.",
    includes: "Every status.",
  },
  "production.completed": {
    ...PREP_BASE,
    label: "Completed",
    measures: "Prep tasks marked done.",
    includes: "Completed only.",
  },
  "production.blocked": {
    ...PREP_BASE,
    label: "Blocked",
    measures: "Prep tasks marked blocked.",
    includes: "Blocked only.",
  },
  "production.completion_rate": {
    ...PREP_BASE,
    label: "Completion rate",
    measures: "Completed tasks divided by all tasks in the period.",
    includes: "Every status in the bottom number; completed in the top.",
  },
  "workforce.shifts": {
    ...SHIFT_BASE,
    label: "Shifts",
    measures: "How many shifts fall in the period.",
    includes: "Every status.",
  },
  "workforce.scheduled_hours": {
    ...SHIFT_BASE,
    label: "Scheduled hours",
    measures: "Hours from shift start to shift end, added together.",
    includes: "Every status. A shift with no end time adds no hours.",
  },
  "workforce.completed": {
    ...SHIFT_BASE,
    label: "Completed",
    measures: "Shifts marked worked.",
    includes: "Completed only.",
  },
  "workforce.no_shows": {
    ...SHIFT_BASE,
    label: "No-shows",
    measures: "Shifts marked no-show.",
    includes: "No-show only.",
  },
  "logistics.deliveries": {
    ...DELIVERY_BASE,
    label: "Deliveries",
    measures: "How many deliveries fall in the period.",
    includes: "Every status.",
  },
  "logistics.delivered": {
    ...DELIVERY_BASE,
    label: "Delivered",
    measures: "Deliveries marked delivered.",
    includes: "Delivered only.",
  },
  "logistics.in_transit": {
    ...DELIVERY_BASE,
    label: "In transit",
    measures: "Deliveries on the road now.",
    includes: "In transit only.",
  },
  "logistics.failed": {
    ...DELIVERY_BASE,
    label: "Failed",
    measures: "Deliveries marked failed.",
    includes: "Failed only.",
  },
  "finance.invoiced": {
    ...INVOICE_BASE,
    label: "Invoiced",
    measures: "Invoice totals added together, in your company's money.",
    includes: "Every status except voided.",
    leftOut: "Voided invoices stay in the rows but add $0. Deleted invoices.",
  },
  "finance.collected": {
    ...INVOICE_BASE,
    label: "Collected",
    measures: "Completed payments recorded against the invoices.",
    includes: "Completed payments on invoices of every status except voided.",
    leftOut:
      "Pending, failed and refunded payments. Voided invoices add $0. Credit and written-off amounts are not money received.",
  },
  "finance.outstanding": {
    ...INVOICE_BASE,
    label: "Outstanding",
    measures: "What is still owed on the invoices.",
    includes: "Every status except voided.",
    leftOut:
      "Voided invoices add $0. Credit and write-offs lower what is owed, so Collected plus Outstanding can be less than Invoiced.",
  },
  "finance.overdue": {
    ...INVOICE_BASE,
    label: "Overdue invoices",
    measures: "Invoices past their due date with money still owed.",
    currency: "none",
    includes: "Marked overdue, or past due with a balance.",
    leftOut: "Voided and written-off invoices.",
    tax: NOT_MONEY,
  },
} as const satisfies Record<string, MetricDefinition>;
