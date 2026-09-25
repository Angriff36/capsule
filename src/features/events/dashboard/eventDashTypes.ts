import type { Doc, Id } from "../../../lib/api";
import type { EventDetailRevisePanelsProps } from "../EventDetailRevisePanels";
import type {
  EventLifecycleAction,
  EventLifecycleActionKey,
} from "../EventLifecyclePolicy";

/** The slice of the Event document the dashboard reads directly. */
export type DashEvent = {
  hasAssignedClient?: boolean;
  hasExpectedHeadcount?: boolean;
  hasMenuDishes?: boolean;
  hasStaffAssigned?: boolean;
  eventType: string;
  clientName?: string | null;
  venueId?: Id<"venues"> | null;
  venueName?: string | null;
  venueAddress?: string | null;
  occasionId?: Id<"occasions"> | null;
  occasionName?: string | null;
  serviceStyleId?: Id<"serviceStyles"> | null;
  serviceStyleName?: string | null;
  referralSourceId?: Id<"referralSources"> | null;
  assignedToId?: Id<"people"> | null;
  ownerName?: string | null;
  timingOutboundTravelMinutes?: number | null;
  recurrenceFrequency?: string | null;
  recurrenceGeneratedCount?: number | null;
  recurrenceActive?: boolean | null;
};

export type DashOwnerPerson = {
  _id: string;
  givenName: string;
  familyName: string;
  role: string;
};

export type EventDashOverviewProps = EventDetailRevisePanelsProps & {
  event: DashEvent;
  venue: Doc<"venues"> | null | undefined;
  clientId?: string | null;
  clients: Doc<"clients">[] | undefined;
  stage: string;
  currencyCode: string;
  lifecycleActions: readonly EventLifecycleAction[];
  onAction: (key: EventLifecycleActionKey) => void;
  people: readonly DashOwnerPerson[] | undefined;
  dishCount: number;
  staffCount: number;
  timelineCount: number;
};

export type DashSheetId =
  | "details"
  | "ready"
  | "money"
  | "service"
  | "workbook"
  | "ops"
  | "weather"
  | "team"
  | "recurring"
  | "notes"
  | "stage"
  | "edit";
