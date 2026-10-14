import type { Doc } from "../../lib/api";
import { useAuthStatus } from "../../lib/useAuthStatus";
import {
  useCompanyVisionRevise,
  useCreateCompanyVision,
  useListCompanyVision,
  useListPerson,
  useListVisionItem,
} from "@/lib/manifest-convex-react";

type Vision = Doc<"companyVisions">;

/** Roles that hold manageAccess in src/foundation/base.manifest. */
export function canManageRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (
    role === "manager" ||
    role.endsWith("_manager") ||
    role === "admin" ||
    role === "owner" ||
    role === "system"
  );
}

export function useEosViewer() {
  const status = useAuthStatus();
  return {
    canEdit: canManageRole(status?.role),
    myPersonId: status?.personId ?? null,
    loaded: status !== undefined,
  };
}

export function useActivePeople() {
  const people = useListPerson();
  return (people ?? [])
    .filter((row) => row.deletedAt == null && row.status === "active")
    .sort((a, b) =>
      `${a.givenName} ${a.familyName}`.localeCompare(
        `${b.givenName} ${b.familyName}`,
      ),
    );
}

/** The company's one live V/TO row, or null while none is written. */
export function useCompanyVision() {
  const rows = useListCompanyVision();
  const vision =
    rows === undefined
      ? undefined
      : ([...rows]
          .filter((row) => row.writtenAt != null)
          .sort((a, b) => (a.writtenAt ?? 0) - (b.writtenAt ?? 0))[0] ?? null);
  return vision;
}

export function useVisionItems() {
  return useListVisionItem();
}

export type VisionFields = {
  coreFocusPurpose?: string;
  coreFocusNiche?: string;
  tenYearTarget?: string;
  tenYearDate?: number;
  targetMarket?: string;
  provenProcess?: string;
  guarantee?: string;
  threeYearDate?: number;
  threeYearRevenue?: number;
  threeYearProfit?: number;
  threeYearMeasurables?: string;
  oneYearDate?: number;
  oneYearRevenue?: number;
  oneYearProfit?: number;
  oneYearMeasurables?: string;
  quarterDate?: number;
  quarterRevenue?: number;
  quarterProfit?: number;
  quarterMeasurables?: string;
  peopleBarMaxMixed?: number;
};

const FIELD_KEYS: (keyof VisionFields)[] = [
  "coreFocusPurpose",
  "coreFocusNiche",
  "tenYearTarget",
  "tenYearDate",
  "targetMarket",
  "provenProcess",
  "guarantee",
  "threeYearDate",
  "threeYearRevenue",
  "threeYearProfit",
  "threeYearMeasurables",
  "oneYearDate",
  "oneYearRevenue",
  "oneYearProfit",
  "oneYearMeasurables",
  "quarterDate",
  "quarterRevenue",
  "quarterProfit",
  "quarterMeasurables",
  "peopleBarMaxMixed",
];

/**
 * Saves one or more V/TO fields. The update command clears any field it is
 * not sent, so every stored field is sent again with the change.
 */
export function useSaveVision(vision: Vision | null | undefined) {
  const write = useCreateCompanyVision();
  const revise = useCompanyVisionRevise();
  return (
    change: Partial<Record<keyof VisionFields, string | number | null>>,
  ) => {
    const fields: Record<string, unknown> = {};
    for (const key of FIELD_KEYS) {
      const next = key in change ? change[key] : vision?.[key];
      if (next !== null && next !== undefined && next !== "")
        fields[key] = next;
    }
    return vision
      ? revise({ docId: vision._id, version: vision.version, ...fields })
      : write(fields);
  };
}
