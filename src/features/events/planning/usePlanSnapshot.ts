import { useMemo } from "react";
import {
  useListAvailabilityWindow,
  useListEquipment,
  useListEquipmentIssue,
  useListEquipmentPart,
  useListEquipmentReservation,
  useListEventAssignment,
  useListEventPlanNeeds,
  useListEventStaffNeed,
  useListEventVehicleAssignment,
  useListOrganization,
  useListPackList,
  useListPackListItem,
  useListPerson,
  useListQualification,
  useListTimeOffRequest,
  useListTrailer,
  useListVehicle,
} from "../../../lib/manifest-convex-react";
import {
  parsePlanLevels,
  type PlanLevels,
  type PlanSnapshot,
} from "../../../lib/planningChecks";
import { useEventRecordsInRange } from "../../facilities/useEventsById";
import { DAY_MS } from "../../home/homeCalendar";

const PLAN_WINDOW_DAYS = 90;

export type PlanData = {
  loading: boolean;
  snap: PlanSnapshot;
  levels: PlanLevels;
  organization:
    | { _id: string; version: number; planningChecksJson?: string | null }
    | undefined;
};

/**
 * Everything the planning board reads, as one snapshot. A list this role may
 * not read comes back empty, so its checks simply find nothing.
 */
export function usePlanSnapshot(anchor: number): PlanData {
  // Events within 90 days either side of the day the board is showing: more
  // than the 42-day month grid, so multi-day jobs and the events they could
  // clash with are all here. The window moves with the board, not each render.
  const eventWindow = useMemo(
    () => ({
      from: anchor - PLAN_WINDOW_DAYS * DAY_MS,
      to: anchor + PLAN_WINDOW_DAYS * DAY_MS,
    }),
    [anchor],
  );
  const events = useEventRecordsInRange(eventWindow);
  const assignments = useListEventAssignment();
  const staffNeeds = useListEventStaffNeed();
  const rigs = useListEventVehicleAssignment();
  const vehicles = useListVehicle();
  const trailers = useListTrailer();
  const people = useListPerson();
  const timeOff = useListTimeOffRequest();
  const availability = useListAvailabilityWindow();
  const qualifications = useListQualification();
  const equipment = useListEquipment();
  const reservations = useListEquipmentReservation();
  const parts = useListEquipmentPart();
  const equipmentIssues = useListEquipmentIssue();
  const packLists = useListPackList();
  const packLines = useListPackListItem();
  const planNeeds = useListEventPlanNeeds();
  const organizations = useListOrganization();

  const lists = [
    events,
    assignments,
    staffNeeds,
    rigs,
    vehicles,
    trailers,
    people,
    timeOff,
    availability,
    qualifications,
    equipment,
    reservations,
    parts,
    equipmentIssues,
    packLists,
    packLines,
    planNeeds,
    organizations,
  ];
  const loading = lists.some((value) => value === undefined);
  const organization = organizations?.find((row) => row.deletedAt == null);

  const snap = useMemo<PlanSnapshot>(
    () => ({
      events: (events ?? []).map((row) => ({
        ...row,
        stage: String(row.stage),
      })),
      assignments: (assignments ?? []).map((row) => ({
        ...row,
        status: String(row.status),
      })),
      staffNeeds: (staffNeeds ?? []).map((row) => ({
        ...row,
        status: String(row.status),
      })),
      rigs: rigs ?? [],
      vehicles: (vehicles ?? []).map((row) => ({
        ...row,
        operationalStatus: String(row.operationalStatus),
      })),
      trailers: (trailers ?? []).map((row) => ({
        ...row,
        operationalStatus: String(row.operationalStatus),
      })),
      people: (people ?? []).map((row) => ({
        ...row,
        status: String(row.status),
      })),
      timeOff: (timeOff ?? []).map((row) => ({
        ...row,
        status: String(row.status),
      })),
      availability: (availability ?? []).map((row) => ({
        ...row,
        status: String(row.status),
        kind: row.kind == null ? null : String(row.kind),
      })),
      qualifications: (qualifications ?? []).map((row) => ({
        ...row,
        status: String(row.status),
      })),
      equipment: (equipment ?? []).map((row) => ({
        ...row,
        condition: String(row.condition),
        status: String(row.status),
      })),
      reservations: (reservations ?? []).map((row) => ({
        ...row,
        status: String(row.status),
      })),
      parts: (parts ?? []).map((row) => ({ ...row, role: String(row.role) })),
      equipmentIssues: (equipmentIssues ?? []).map((row) => ({
        ...row,
        status: String(row.status),
      })),
      packLists: (packLists ?? []).map((row) => ({
        ...row,
        status: String(row.status),
      })),
      packLines: (packLines ?? []).map((row) => ({
        ...row,
        requiredQuantity: Number(row.requiredQuantity),
      })),
      planNeeds: planNeeds ?? [],
    }),
    [
      events,
      assignments,
      staffNeeds,
      rigs,
      vehicles,
      trailers,
      people,
      timeOff,
      availability,
      qualifications,
      equipment,
      reservations,
      parts,
      equipmentIssues,
      packLists,
      packLines,
      planNeeds,
    ],
  );

  const levels = useMemo(
    () => parsePlanLevels(organization?.planningChecksJson),
    [organization?.planningChecksJson],
  );

  return { loading, snap, levels, organization };
}
