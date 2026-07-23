type Row = Record<string, any>;

export type ShiftSwapEligibility = {
  eligible: boolean;
  reasons: string[];
  targetQualificationId?: string;
  targetTrainingCompletionId?: string;
};

type EvaluateShiftSwapCandidateArgs = {
  candidate: Row;
  shift: Row;
  shifts: Row[];
  timeOffRequests: Row[];
  qualifications: Row[];
  trainingCompletions: Row[];
  shiftTypes: Row[];
  now?: number;
};

const overlaps = (
  leftStartsAt?: number | null,
  leftEndsAt?: number | null,
  rightStartsAt?: number | null,
  rightEndsAt?: number | null,
) =>
  leftStartsAt != null &&
  leftEndsAt != null &&
  rightStartsAt != null &&
  rightEndsAt != null &&
  leftStartsAt < rightEndsAt &&
  rightStartsAt < leftEndsAt;

/**
 * Explain whether a Person can receive a scheduled shift right now.
 *
 * Manifest revalidates the durable assignment, active Person, and credential
 * proofs during approval. This presentation helper also screens current shift
 * conflicts and approved time off so staff never have to propose an obviously
 * unusable swap.
 */
export function evaluateShiftSwapCandidate({
  candidate,
  shift,
  shifts,
  timeOffRequests,
  qualifications,
  trainingCompletions,
  shiftTypes,
  now = Date.now(),
}: EvaluateShiftSwapCandidateArgs): ShiftSwapEligibility {
  const reasons: string[] = [];
  let targetQualificationId: string | undefined;
  let targetTrainingCompletionId: string | undefined;

  if (candidate.deletedAt != null || candidate.status !== "active") {
    reasons.push("Staff profile is not active.");
  }
  if (!candidate.authSubjectId) {
    reasons.push("Staff profile is not linked to a sign-in.");
  }
  if (String(candidate._id) === String(shift.personId)) {
    reasons.push("Choose another staff member.");
  }
  if (
    shift.deletedAt != null ||
    shift.status !== "scheduled" ||
    shift.startsAt == null ||
    shift.endsAt == null ||
    shift.startsAt <= now
  ) {
    reasons.push("Only a future scheduled shift can be swapped.");
  }

  const hasShiftConflict = shifts.some(
    (row) =>
      String(row._id) !== String(shift._id) &&
      String(row.personId) === String(candidate._id) &&
      row.deletedAt == null &&
      ["scheduled", "started"].includes(String(row.status)) &&
      overlaps(row.startsAt, row.endsAt, shift.startsAt, shift.endsAt),
  );
  if (hasShiftConflict) {
    reasons.push("Already scheduled during this shift.");
  }

  const hasApprovedTimeOff = timeOffRequests.some(
    (row) =>
      String(row.personId) === String(candidate._id) &&
      row.deletedAt == null &&
      row.status === "approved" &&
      overlaps(row.startsAt, row.endsAt, shift.startsAt, shift.endsAt),
  );
  if (hasApprovedTimeOff) {
    reasons.push("Has approved time off during this shift.");
  }

  if (shift.requiredQualificationId) {
    const sourceQualification = qualifications.find(
      (row) => String(row._id) === String(shift.requiredQualificationId),
    );
    const replacement = qualifications.find(
      (row) =>
        String(row.personId) === String(candidate._id) &&
        row.deletedAt == null &&
        row.status === "active" &&
        sourceQualification != null &&
        row.name === sourceQualification.name &&
        row.certificationType === sourceQualification.certificationType &&
        (row.expiresAt == null ||
          shift.endsAt == null ||
          row.expiresAt >= shift.endsAt),
    );
    if (replacement) {
      targetQualificationId = String(replacement._id);
    } else {
      reasons.push(
        sourceQualification
          ? `Needs ${sourceQualification.name} through the end of the shift.`
          : "The shift certification requirement cannot be verified.",
      );
    }
  }

  if (shift.shiftTypeId) {
    const shiftType = shiftTypes.find(
      (row) => String(row._id) === String(shift.shiftTypeId),
    );
    if (shiftType?.requiredTrainingModuleId) {
      const completion = trainingCompletions.find(
        (row) =>
          String(row.personId) === String(candidate._id) &&
          String(row.trainingModuleId) ===
            String(shiftType.requiredTrainingModuleId) &&
          row.deletedAt == null &&
          row.recordedAt != null,
      );
      if (completion) {
        targetTrainingCompletionId = String(completion._id);
      } else {
        reasons.push("Required shift-type training is not complete.");
      }
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    targetQualificationId,
    targetTrainingCompletionId,
  };
}
