import { StatusChip } from "../../ui/primitives";

export interface KitLine {
  _id: string;
  version: number;
  serviceStyleId: string;
  description: string;
  baseQuantity: number;
  guestsPerUnit?: number | null;
  unit: string;
  note?: string | null;
  sortOrder?: number | null;
  status: unknown;
  deletedAt?: number | null;
}

function quantityRule(line: KitLine): string {
  const base = `${line.baseQuantity} ${line.unit}`;
  if (line.guestsPerUnit == null) return base;
  const scaled = `1 per ${line.guestsPerUnit} guests`;
  return line.baseQuantity > 0 ? `${base} + ${scaled}` : scaled;
}

interface ServiceStyleKitLineTableProps {
  lines: KitLine[];
  busy: string | null;
  onMove: (index: number, step: -1 | 1) => void;
  onEdit: (line: KitLine) => void;
  onRetire: (line: KitLine) => void;
  onReinstate: (line: KitLine) => void;
}

/** The kit lines of one service style, in pack order. */
export function ServiceStyleKitLineTable({
  lines,
  busy,
  onMove,
  onEdit,
  onRetire,
  onReinstate,
}: ServiceStyleKitLineTableProps) {
  return (
    <div className="supply-table-wrap mt-3">
      <table className="supply-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Quantity rule</th>
            <th>Packer note</th>
            <th>State</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line._id}>
              <td>
                <strong>{line.description}</strong>
              </td>
              <td>{quantityRule(line)}</td>
              <td>{line.note || "—"}</td>
              <td>
                <StatusChip status={String(line.status)} />
              </td>
              <td>
                <div className="supply-row-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Move ${line.description} up`}
                    title="Move up"
                    disabled={busy != null || index === 0}
                    onClick={() => onMove(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Move ${line.description} down`}
                    title="Move down"
                    disabled={busy != null || index === lines.length - 1}
                    onClick={() => onMove(index, 1)}
                  >
                    ↓
                  </button>
                  {String(line.status) === "active" ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() => onEdit(line)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() => onRetire(line)}
                      >
                        Retire
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() => onReinstate(line)}
                    >
                      Reinstate
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
