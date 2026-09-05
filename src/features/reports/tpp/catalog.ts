import { TPP_CONTACT_REPORTS } from "./catalog.contacts";
import { TPP_EVENT_REPORTS } from "./catalog.event";
import { TPP_FINANCIAL_REPORTS } from "./catalog.financial";
import { TPP_GENERAL_REPORTS } from "./catalog.general";
import type {
  TppReportCategory,
  TppReportDefinition,
  TppReportId,
} from "./types";

export const TPP_REPORT_CATALOG: readonly TppReportDefinition[] = [
  ...TPP_CONTACT_REPORTS,
  ...TPP_EVENT_REPORTS,
  ...TPP_FINANCIAL_REPORTS,
  ...TPP_GENERAL_REPORTS,
];

export const TPP_REPORT_BY_ID = new Map<TppReportId, TppReportDefinition>(
  TPP_REPORT_CATALOG.map((definition) => [definition.id, definition]),
);

export const TPP_DEFAULT_FAVORITES = [
  "event-booking",
  "event-changes",
  "event-list",
  "event-menu",
  "event-timeline",
  "event-worksheet",
  "proposal-of-service",
] as const satisfies readonly TppReportId[];

export const TPP_CATEGORY_LABELS: Record<TppReportCategory, string> = {
  contacts: "Contacts",
  event: "Event",
  financial: "Financial",
  tpp_general: "TPP General",
};

const expectedCounts: Record<TppReportCategory, number> = {
  contacts: 11,
  event: 29,
  financial: 36,
  tpp_general: 13,
};

function validateCatalog(): void {
  if (TPP_REPORT_CATALOG.length !== 89) {
    throw new Error(
      `TPP report catalog must contain 89 reports; found ${TPP_REPORT_CATALOG.length}.`,
    );
  }
  if (TPP_REPORT_BY_ID.size !== TPP_REPORT_CATALOG.length) {
    throw new Error("TPP report catalog contains duplicate IDs.");
  }
  for (const [category, count] of Object.entries(expectedCounts)) {
    const actual = TPP_REPORT_CATALOG.filter(
      (definition) => definition.category === category,
    ).length;
    if (actual !== count) {
      throw new Error(
        `TPP ${category} category must contain ${count} reports; found ${actual}.`,
      );
    }
  }
  for (const favorite of TPP_DEFAULT_FAVORITES) {
    if (!TPP_REPORT_BY_ID.has(favorite)) {
      throw new Error(
        `TPP default favorite ${favorite} is not in the catalog.`,
      );
    }
  }
}

validateCatalog();

export type {
  TppReportCategory,
  TppReportDefinition,
  TppReportId,
  TppReportParameter,
  TppReportResult,
} from "./types";
