import { Fragment, type FormEvent } from "react";
import type { Id } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import { StatusChip } from "../../ui/primitives";

export const EQUIPMENT_CONDITIONS = [
  "excellent",
  "good",
  "fair",
  "poor",
  "out_of_service",
] as const;

export type EquipmentCondition = (typeof EQUIPMENT_CONDITIONS)[number];
export type ChecklistMode = "checkout" | "return";

export type ChecklistDraft = {
  reservationId: Id<"equipmentReservations">;
  mode: ChecklistMode;
  condition: EquipmentCondition;
  note: string;
};

/** One reservation, already joined to its catalog item by the panel. */
export type EquipmentSheetRow = {
  readonly id: Id<"equipmentReservations">;
  readonly status: string;
  readonly name: string;
  readonly assetTag: string;
  readonly category: string;
  readonly quantity: number;
  readonly startsAt?: number | null;
  readonly endsAt?: number | null;
  readonly checkedOutAt?: number | null;
  readonly checkoutCondition?: string | null;
  readonly checkoutNote?: string | null;
  readonly returnedAt?: number | null;
  readonly returnCondition?: string | null;
  readonly returnNote?: string | null;
};

const CONDITION_RANK: Record<EquipmentCondition, number> = {
  excellent: 0,
  good: 1,
  fair: 2,
  poor: 3,
  out_of_service: 4,
};

type Props = {
  readonly rows: readonly EquipmentSheetRow[];
  readonly busy: string | null;
  readonly draft: ChecklistDraft | null;
  readonly onOpenChecklist: (row: EquipmentSheetRow) => void;
  readonly onDraftChange: (draft: ChecklistDraft) => void;
  readonly onDismissDraft: () => void;
  readonly onSubmitDraft: (formEvent: FormEvent<HTMLFormElement>) => void;
  readonly onRelease: (row: EquipmentSheetRow) => void;
};

/** Dispatch sheet: one row per reservation, outbound and return in-line. */
export function EventEquipmentSheet({
  rows,
  busy,
  draft,
  onOpenChecklist,
  onDraftChange,
  onDismissDraft,
  onSubmitDraft,
  onRelease,
}: Props) {
  return (
    <div className="card equipment-sheet overflow-hidden">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Category</th>
            <th className="equipment-sheet__numeric">Qty</th>
            <th>Load window</th>
            <th>Outbound</th>
            <th>Return</th>
            <th className="equipment-sheet__numeric">Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isEditing = draft?.reservationId === row.id;
            return (
              <Fragment key={row.id}>
                <tr
                  data-status={row.status}
                  data-testid="equipment-checklist-row"
                >
                  <td className="equipment-sheet__item">
                    <strong>{row.name}</strong>
                    <span>{row.assetTag}</span>
                  </td>
                  <td className="equipment-sheet__muted">{row.category}</td>
                  <td className="equipment-sheet__numeric">{row.quantity}</td>
                  <td>
                    <div className="equipment-sheet__window">
                      <span>
                        {formatDate(row.startsAt)} · {formatTime(row.startsAt)}
                      </span>
                      <small>
                        Back {formatDate(row.endsAt)} · {formatTime(row.endsAt)}
                      </small>
                    </div>
                  </td>
                  <td>
                    <Checkpoint
                      complete={row.checkedOutAt != null}
                      condition={row.checkoutCondition}
                      note={row.checkoutNote}
                      timestamp={row.checkedOutAt}
                      pendingLabel="Confirm checkout"
                      waiting={null}
                      disabled={row.status !== "reserved" || busy != null}
                      onAction={() => onOpenChecklist(row)}
                    />
                  </td>
                  <td>
                    <Checkpoint
                      complete={row.returnedAt != null}
                      condition={row.returnCondition}
                      note={row.returnNote}
                      timestamp={row.returnedAt}
                      pendingLabel="Confirm return"
                      waiting={
                        row.status === "reserved"
                          ? "Waiting for checkout"
                          : null
                      }
                      disabled={row.status !== "checked_out" || busy != null}
                      onAction={() => onOpenChecklist(row)}
                      comparison={conditionComparison(
                        row.checkoutCondition,
                        row.returnCondition,
                      )}
                    />
                  </td>
                  <td className="equipment-sheet__numeric">
                    <StatusChip status={row.status} />
                  </td>
                  <td className="equipment-sheet__numeric">
                    {row.status === "reserved" ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() => onRelease(row)}
                      >
                        Release
                      </button>
                    ) : null}
                  </td>
                </tr>
                {isEditing && draft ? (
                  <tr>
                    <td colSpan={8} className="equipment-sheet__bleed">
                      <form
                        className="equipment-inspection"
                        onSubmit={onSubmitDraft}
                        data-testid="equipment-condition-form"
                      >
                        <div className="equipment-inspection__title">
                          <span>
                            {draft.mode === "checkout"
                              ? "Outbound check"
                              : "Return check"}
                          </span>
                          <label className="field-label">
                            Condition
                            <select
                              className="input"
                              value={draft.condition}
                              onChange={(changeEvent) =>
                                onDraftChange({
                                  ...draft,
                                  condition: changeEvent.target
                                    .value as EquipmentCondition,
                                })
                              }
                            >
                              {EQUIPMENT_CONDITIONS.map((condition) => (
                                <option key={condition} value={condition}>
                                  {condition.replaceAll("_", " ")}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label className="field-label">
                          Condition notes
                          <textarea
                            className="input"
                            rows={2}
                            placeholder="Optional: scratches, missing parts, damp linens…"
                            value={draft.note}
                            onChange={(changeEvent) =>
                              onDraftChange({
                                ...draft,
                                note: changeEvent.target.value,
                              })
                            }
                          />
                        </label>
                        <div className="equipment-inspection__actions">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={onDismissDraft}
                          >
                            Cancel
                          </button>
                          <button
                            className="btn btn-primary"
                            disabled={busy != null}
                          >
                            {busy != null
                              ? "Saving…"
                              : draft.mode === "checkout"
                                ? "Confirm left site"
                                : "Confirm returned"}
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Checkpoint({
  complete,
  condition,
  note,
  timestamp,
  pendingLabel,
  waiting,
  disabled,
  onAction,
  comparison,
}: {
  complete: boolean;
  condition?: string | null;
  note?: string | null;
  timestamp?: number | null;
  pendingLabel: string;
  waiting: string | null;
  disabled: boolean;
  onAction: () => void;
  comparison?: { label: string; tone: "match" | "changed" } | null;
}) {
  if (complete) {
    return (
      <div className="equipment-checkpoint">
        <strong>{condition?.replaceAll("_", " ") ?? "Recorded"}</strong>
        {comparison ? (
          <span data-tone={comparison.tone}>{comparison.label}</span>
        ) : null}
        {note ? <small>{note}</small> : null}
        {timestamp ? (
          <time>
            {formatDate(timestamp)} · {formatTime(timestamp)}
          </time>
        ) : null}
      </div>
    );
  }
  if (waiting != null) {
    return (
      <div className="equipment-checkpoint">
        <span className="equipment-checkpoint__waiting">{waiting}</span>
      </div>
    );
  }
  return (
    <div className="equipment-checkpoint">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={disabled}
        onClick={onAction}
      >
        {pendingLabel}
      </button>
    </div>
  );
}

export function conditionComparison(
  outbound?: string | null,
  returned?: string | null,
): { label: string; tone: "match" | "changed" } | null {
  if (!outbound || !returned) return null;
  const outboundRank = CONDITION_RANK[outbound as EquipmentCondition];
  const returnRank = CONDITION_RANK[returned as EquipmentCondition];
  if (outboundRank === undefined || returnRank === undefined) return null;
  if (returnRank <= outboundRank) {
    return { label: "Matches outbound", tone: "match" };
  }
  return {
    label: `Changed from ${outbound.replaceAll("_", " ")}`,
    tone: "changed",
  };
}
