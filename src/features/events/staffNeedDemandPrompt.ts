import type { ActionPromptSession } from "../../ui/action-prompt/useActionPrompt";
import type { EventStaffNeedRow } from "./EventStaffingCoverageView";

export type StaffNeedDemand = {
  qualificationName?: string;
  skills?: string;
  uniform?: string;
  workLocation?: string;
  payBasis?: "hourly" | "flat_rate";
  budgetHourlyRate?: number;
};

/** Ask what one staffing need asks for (AC-504); null when dismissed. */
export async function askStaffNeedDemand(
  prompt: ActionPromptSession,
  need: EventStaffNeedRow,
): Promise<StaffNeedDemand | null> {
  const values = await prompt.askFields({
    title: `What the ${need.role} work needs`,
    description:
      "A certificate here is checked when someone takes the shift. Leave a box blank if it doesn't apply.",
    fields: [
      {
        name: "qualificationName",
        label: "Certificate needed",
        required: false,
        placeholder: "e.g. Food handler",
        defaultValue: need.qualificationName ?? "",
      },
      {
        name: "skills",
        label: "Skills",
        required: false,
        defaultValue: need.skills ?? "",
      },
      {
        name: "uniform",
        label: "What to wear",
        required: false,
        defaultValue: need.uniform ?? "",
      },
      {
        name: "workLocation",
        label: "Where at the event",
        required: false,
        defaultValue: need.workLocation ?? "",
      },
      {
        name: "payBasis",
        label: "Pay",
        required: false,
        placeholder: "Not set",
        defaultValue: need.payBasis ?? "",
        options: [
          { value: "hourly", label: "Hourly" },
          { value: "flat_rate", label: "Flat rate" },
        ],
      },
      {
        name: "budgetHourlyRate",
        label: "Labor budget per hour ($)",
        required: false,
        defaultValue:
          need.budgetHourlyRate != null ? String(need.budgetHourlyRate) : "",
      },
    ],
    confirmLabel: "Save",
  });
  if (!values) return null;
  const text = (value?: string) => (value?.trim() ? value.trim() : undefined);
  const budget = Number(values.budgetHourlyRate);
  return {
    qualificationName: text(values.qualificationName),
    skills: text(values.skills),
    uniform: text(values.uniform),
    workLocation: text(values.workLocation),
    payBasis:
      values.payBasis === "hourly" || values.payBasis === "flat_rate"
        ? values.payBasis
        : undefined,
    budgetHourlyRate:
      text(values.budgetHourlyRate) && Number.isFinite(budget) && budget >= 0
        ? budget
        : undefined,
  };
}
