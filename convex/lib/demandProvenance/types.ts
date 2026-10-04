export type DemandProvenanceChange = {
  at: number;
  kind: "recalculated" | "superseded";
  reason: string | null;
  previousQuantity: number | null;
  nextQuantity: number | null;
  changedInputs: Array<{ label: string; before: string; after: string }>;
};

export type DemandProvenanceRow = {
  id: string;
  quantity: number;
  unit: string;
  deleted: boolean;
  sourceKey: string | null;
  supersededBySourceKey: string | null;
  dishId: string;
  componentId: string | null;
  eventId: string;
  calculationSnapshot: Record<string, unknown> | null;
  supersedeReason: string | null;
};

export type DemandProvenanceTotal =
  | { state: "ready"; quantity: number; unit: string }
  | { state: "mismatch"; units: string[] };
