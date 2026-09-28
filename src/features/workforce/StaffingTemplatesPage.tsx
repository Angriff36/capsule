import { useState } from "react";
import {
  useCreateStaffingTemplate,
  useListServiceStyle,
  useListStaffingTemplate,
  useStaffingTemplateReactivate,
  useStaffingTemplateRetire,
  useStaffingTemplateRevise,
} from "../../lib/manifest-convex-react";
import { parseTemplateLines } from "../../lib/staffingTemplates";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";
import {
  StaffingTemplateForm,
  type StaffingTemplateDraft,
} from "./StaffingTemplateForm";

/** "Server: 1 per 20 guests (at least 2), Food handler" - one line per role. */
export function describeTemplateLines(lines: string): string {
  return parseTemplateLines(lines)
    .map((line) => {
      const count = [
        line.fixedCount ? String(line.fixedCount) : null,
        line.guestsPerWorker ? `1 per ${line.guestsPerWorker} guests` : null,
      ]
        .filter(Boolean)
        .join(" + ");
      const extras = [
        line.minCount ? `at least ${line.minCount}` : null,
        line.qualificationName ? `${line.qualificationName} certificate` : null,
      ].filter(Boolean);
      return `${line.role}: ${count || "0"}${extras.length ? ` (${extras.join(", ")})` : ""}`;
    })
    .join(" · ");
}

function guestRange(min?: number | null, max?: number | null) {
  if (min == null && max == null) return "Any size";
  if (min != null && max != null) return `${min}-${max} guests`;
  return min != null ? `${min}+ guests` : `Up to ${max} guests`;
}

/** Crew templates: the crew an approved event gets for its style and size. */
export function StaffingTemplatesPage() {
  const templates = useListStaffingTemplate();
  const styles = useListServiceStyle();
  const create = useCreateStaffingTemplate();
  const revise = useStaffingTemplateRevise();
  const retire = useStaffingTemplateRetire();
  const reactivate = useStaffingTemplateReactivate();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const liveStyles = (styles ?? [])
    .filter((row) => row.deletedAt == null)
    .map((row) => ({ _id: row._id, name: row.name }));
  const styleName = (id?: string | null) =>
    id
      ? (liveStyles.find((row) => row._id === id)?.name ?? "Unknown style")
      : "Any style";
  const rows = (templates ?? [])
    .filter((row) => row.deletedAt == null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    try {
      await work();
      setEditing(null);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  const save = (draft: StaffingTemplateDraft) => {
    const current = rows.find((row) => row._id === editing);
    void run(() =>
      current
        ? revise({ docId: current._id, version: current.version, ...draft })
        : create(draft),
    );
  };

  return (
    <div className="operations-stage">
      <header className="training-masthead">
        <div>
          <p className="eyebrow">Staff · Crew templates</p>
          <h1 className="display-title mt-2">
            The crew each kind of event needs.
          </h1>
          <p className="mt-3 max-w-160 text-ink-2">
            When an event is approved, the template for its service style and
            guest count posts its open shifts. If the guest count changes, only
            shifts nobody has taken are added or removed. No matching template
            means no shifts are added.
          </p>
        </div>
        <div aria-label="Crew template actions">
          <button
            className="btn btn-primary"
            onClick={() => setEditing(editing === "new" ? null : "new")}
          >
            {editing === "new" ? "Close" : "New crew template"}
          </button>
        </div>
      </header>

      <WorkforceWorkspaceNav />
      {failure ? <WorkforceFailureBanner error={failure} /> : null}

      {editing === "new" ? (
        <section className="working-ledger">
          <StaffingTemplateForm
            styles={liveStyles}
            busy={busy}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        </section>
      ) : null}

      <section className="working-ledger">
        {templates === undefined ? (
          <TableSkeleton rows={3} />
        ) : rows.length === 0 ? (
          <div className="document-empty">
            <p>
              No crew templates yet. Approved events get no automatic shifts.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line-2">
            {rows.map((row) => (
              <article
                key={row._id}
                className="py-3"
                data-testid="staffing-template-row"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <strong>{row.name}</strong>
                    <p className="text-sm text-ink-2">
                      {styleName(row.serviceStyleId)} ·{" "}
                      {guestRange(row.minGuests, row.maxGuests)}
                    </p>
                    <p className="text-sm text-ink-3">
                      {describeTemplateLines(row.lines)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip
                      status={String(row.status)}
                      label={row.status === "active" ? "In use" : "Not in use"}
                    />
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() =>
                        setEditing(editing === row._id ? null : row._id)
                      }
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          row.status === "active"
                            ? retire({ docId: row._id, version: row.version })
                            : reactivate({
                                docId: row._id,
                                version: row.version,
                              }),
                        )
                      }
                    >
                      {row.status === "active" ? "Stop using" : "Use again"}
                    </button>
                  </div>
                </div>
                {editing === row._id ? (
                  <div className="mt-3">
                    <StaffingTemplateForm
                      initial={{
                        name: row.name,
                        serviceStyleId: row.serviceStyleId ?? undefined,
                        minGuests: row.minGuests ?? undefined,
                        maxGuests: row.maxGuests ?? undefined,
                        lines: row.lines,
                      }}
                      styles={liveStyles}
                      busy={busy}
                      onSave={save}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
