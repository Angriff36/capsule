import {
  AvailabilityWindowWithdrawLifecycle,
  EventAssignmentCheckInLifecycle,
  EventAssignmentCheckOutLifecycle,
  EventAssignmentConfirmLifecycle,
  EventAssignmentMarkNoShowLifecycle,
  EventAssignmentUnassignLifecycle,
  QualificationExpireLifecycle,
  QualificationRevokeLifecycle,
  ShiftCancelLifecycle,
  ShiftCompleteLifecycle,
  ShiftMarkNoShowLifecycle,
  ShiftStartLifecycle,
  TimeRecordClockOutLifecycle,
  TimeRecordCorrectLifecycle,
} from "../../generated/manifest-wiring-bindings";

export interface WorkforceAction<Key extends string = string> {
  key: Key;
  label: string;
}

type Lifecycle = readonly {
  property: string;
  from: string;
  to: string;
  proven: boolean;
}[];

function available<Key extends string>(
  status: string,
  actions: readonly (WorkforceAction<Key> & { lifecycle: Lifecycle })[],
): WorkforceAction<Key>[] {
  return actions
    .filter((action) =>
      action.lifecycle.some(
        (transition) => transition.proven && transition.from === status,
      ),
    )
    .map(({ key, label }) => ({ key, label }));
}

const SHIFT_ACTIONS = [
  { key: "start", label: "Start", lifecycle: ShiftStartLifecycle },
  { key: "complete", label: "Complete", lifecycle: ShiftCompleteLifecycle },
  { key: "cancel", label: "Cancel", lifecycle: ShiftCancelLifecycle },
  { key: "markNoShow", label: "No-show", lifecycle: ShiftMarkNoShowLifecycle },
] as const;

const ASSIGNMENT_ACTIONS = [
  {
    key: "confirm",
    label: "Confirm",
    lifecycle: EventAssignmentConfirmLifecycle,
  },
  {
    key: "checkIn",
    label: "Check in",
    lifecycle: EventAssignmentCheckInLifecycle,
  },
  {
    key: "checkOut",
    label: "Check out",
    lifecycle: EventAssignmentCheckOutLifecycle,
  },
  {
    key: "markNoShow",
    label: "No-show",
    lifecycle: EventAssignmentMarkNoShowLifecycle,
  },
  {
    key: "unassign",
    label: "Unassign",
    lifecycle: EventAssignmentUnassignLifecycle,
  },
] as const;

const AVAILABILITY_ACTIONS = [
  {
    key: "withdraw",
    label: "Withdraw",
    lifecycle: AvailabilityWindowWithdrawLifecycle,
  },
] as const;

const TIME_ACTIONS = [
  {
    key: "clockOut",
    label: "Clock out",
    lifecycle: TimeRecordClockOutLifecycle,
  },
  { key: "correct", label: "Correct", lifecycle: TimeRecordCorrectLifecycle },
] as const;

const QUALIFICATION_ACTIONS = [
  { key: "revoke", label: "Revoke", lifecycle: QualificationRevokeLifecycle },
  { key: "expire", label: "Expire", lifecycle: QualificationExpireLifecycle },
] as const;

export class WorkforceLifecyclePolicy {
  shiftActions(status: string) {
    return available(status, SHIFT_ACTIONS);
  }

  assignmentActions(status: string) {
    return available(status, ASSIGNMENT_ACTIONS);
  }

  availabilityActions(status: string) {
    return available(status, AVAILABILITY_ACTIONS);
  }

  timeActions(status: string) {
    return available(status, TIME_ACTIONS);
  }

  qualificationActions(status: string) {
    return available(status, QUALIFICATION_ACTIONS);
  }
}
