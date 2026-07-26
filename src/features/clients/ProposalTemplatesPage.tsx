import { useState, type FormEvent } from "react";
import {
  useProposalTemplateArchive,
  useProposalTemplateDefine,
  useProposalTemplateReactivate,
  useProposalTemplateRevise,
  useListProposalTemplate,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { ClientsWorkspaceNav } from "./ClientsWorkspaceNav";
import { CrmFailureBanner } from "./CrmFailureBanner";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  archived: "Archived",
} as const;

const PROPOSAL_SECTIONS = [
  { id: "cover_brand", label: "Cover & Brand" },
  { id: "event_summary", label: "Event Summary" },
  { id: "menu_sections", label: "Menu Sections" },
  { id: "timeline", label: "Timeline / Run of Show" },
  { id: "venue_logistics", label: "Venue Logistics" },
  { id: "enhancements", label: "Enhancements / Upgrades" },
  { id: "pricing_summary", label: "Pricing Summary" },
  { id: "terms", label: "Terms & Conditions" },
  { id: "acceptance_cta", label: "Acceptance CTA" },
] as const;

function parsePercentage(value: FormDataEntryValue | null): number | undefined {
  if (!value) return undefined;
  const num = parseFloat(String(value));
  return Number.isFinite(num) && num >= 0 && num <= 100 ? num / 100 : undefined;
}

function formatPercentage(value: number | null | undefined): string {
  if (value == null) return "";
  return `${(value * 100).toFixed(2)}%`;
}

function parseVisibleSections(
  value: FormDataEntryValue | null,
): string[] | undefined {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed as string[];
    }
    return [trimmed];
  } catch {
    return undefined;
  }
}

function formatVisibleSections(value: string[] | null | undefined): string {
  if (!value || !value.length) return "All sections";
  return value
    .map((id) => PROPOSAL_SECTIONS.find((s) => s.id === id)?.label || id)
    .join(", ");
}

export function ProposalTemplatesPage() {
  const templates = useListProposalTemplate();
  const define = useProposalTemplateDefine();
  const revise = useProposalTemplateRevise();
  const archive = useProposalTemplateArchive();
  const reactivate = useProposalTemplateReactivate();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [archiveModal, setArchiveModal] = useState<string | null>(null);
  const [selectedSections, setSelectedSections] = useState<Set<string>>(
    new Set(PROPOSAL_SECTIONS.map((s) => s.id)),
  );

  const activeTemplates = (templates ?? []).filter(
    (row) => row.deletedAt == null,
  );

  const submitDefine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFailure(null);
    setBusy(true);
    void (async () => {
      try {
        const visibleSectionsArray = Array.from(selectedSections);
        await define({
          name: String(data.get("name")),
          description: String(data.get("description") || "") || undefined,
          visibleSections: visibleSectionsArray,
          defaultTerms: String(data.get("defaultTerms") || "") || undefined,
          defaultNotes: String(data.get("defaultNotes") || "") || undefined,
          defaultTaxRate: parsePercentage(data.get("defaultTaxRate")),
          defaultServiceChargePercent: parsePercentage(
            data.get("defaultServiceChargePercent"),
          ),
          validityDays: data.get("validityDays")
            ? Number.parseInt(String(data.get("validityDays")), 10)
            : undefined,
        });
        form.reset();
        setOpen(false);
        setSelectedSections(new Set(PROPOSAL_SECTIONS.map((s) => s.id)));
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  const submitRevise = (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFailure(null);
    setBusy(true);
    void (async () => {
      try {
        const visibleSectionsArray = Array.from(selectedSections);
        await revise({
          id,
          name: String(data.get("name")),
          description: String(data.get("description") || "") || undefined,
          visibleSections: visibleSectionsArray,
          defaultTerms: String(data.get("defaultTerms") || "") || undefined,
          defaultNotes: String(data.get("defaultNotes") || "") || undefined,
          defaultTaxRate: parsePercentage(data.get("defaultTaxRate")),
          defaultServiceChargePercent: parsePercentage(
            data.get("defaultServiceChargePercent"),
          ),
          validityDays: data.get("validityDays")
            ? Number.parseInt(String(data.get("validityDays")), 10)
            : undefined,
        });
        setEditingId(null);
        setSelectedSections(new Set(PROPOSAL_SECTIONS.map((s) => s.id)));
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  const handleArchive = async () => {
    if (!archiveModal) return;
    const reason = prompt("Archive reason:");
    if (!reason?.trim()) return;

    setFailure(null);
    try {
      await archive({
        id: archiveModal,
        reason,
      });
      setArchiveModal(null);
    } catch (error) {
      setFailure(error);
    }
  };

  const handleReactivate = async (id: string) => {
    setFailure(null);
    try {
      await reactivate({ id });
    } catch (error) {
      setFailure(error);
    }
  };

  const toggleSection = (sectionId: string) => {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const loading = templates === undefined;
  const editingTemplate =
    editingId != null ? activeTemplates.find((t) => t._id === editingId) : null;

  // Initialize selected sections when editing
  if (editingTemplate && editingTemplate.visibleSections) {
    const editingSet = new Set<string>(
      (editingTemplate.visibleSections as string[]) ?? [],
    );
    if (
      Array.from(selectedSections).sort().join(",") !==
      Array.from(editingSet).sort().join(",")
    ) {
      setSelectedSections(editingSet);
    }
  }

  return (
    <div className="operations-stage">
      <header className="training-masthead">
        <div>
          <p className="eyebrow">Sales · Proposal Templates</p>
          <h1 className="display-title mt-2">Reusable proposal templates.</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Define proposal templates with default terms, section visibility,
            and pricing preferences. Templates help maintain consistency and
            speed up proposal creation.
          </p>
        </div>
        <div aria-label="Proposal template actions">
          <button className="btn btn-primary" onClick={() => setOpen(!open)}>
            {open ? "Close" : "New template"}
          </button>
        </div>
      </header>

      <ClientsWorkspaceNav />
      {failure ? <CrmFailureBanner error={failure} /> : null}

      {open ? (
        <form
          className="supply-form"
          onSubmit={(e) => {
            if (editingId) {
              submitRevise(e, editingId);
            } else {
              submitDefine(e);
            }
          }}
        >
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Proposal template</p>
              <h2>{editingId ? "Revise template" : "Define a new template"}</h2>
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {busy
                ? "Saving…"
                : editingId
                  ? "Save changes"
                  : "Create template"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Template name
              <input
                name="name"
                className="input"
                placeholder="Standard wedding proposal"
                defaultValue={editingTemplate?.name}
                required
              />
            </label>
            <label className="field-label">
              Description
              <input
                name="description"
                className="input"
                placeholder="When to use this template"
                defaultValue={editingTemplate?.description || ""}
              />
            </label>
            <label className="field-label col-span-2">
              Visible sections
              <div className="checkbox-group">
                {PROPOSAL_SECTIONS.map((section) => (
                  <label key={section.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedSections.has(section.id)}
                      onChange={() => toggleSection(section.id)}
                    />
                    {section.label}
                  </label>
                ))}
              </div>
            </label>
            <label className="field-label col-span-2">
              Default terms
              <textarea
                name="defaultTerms"
                className="input"
                rows={3}
                placeholder="Standard terms and conditions"
                defaultValue={editingTemplate?.defaultTerms || ""}
              />
            </label>
            <label className="field-label col-span-2">
              Default notes
              <textarea
                name="defaultNotes"
                className="input"
                rows={2}
                placeholder="Common notes or reminders"
                defaultValue={editingTemplate?.defaultNotes || ""}
              />
            </label>
            <label className="field-label">
              Default tax rate (%)
              <input
                name="defaultTaxRate"
                className="input"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="8.5"
                defaultValue={formatPercentage(editingTemplate?.defaultTaxRate)}
              />
            </label>
            <label className="field-label">
              Default service charge (%)
              <input
                name="defaultServiceChargePercent"
                className="input"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="20"
                defaultValue={formatPercentage(
                  editingTemplate?.defaultServiceChargePercent,
                )}
              />
            </label>
            <label className="field-label">
              Validity period (days)
              <input
                name="validityDays"
                className="input"
                type="number"
                min="1"
                max="365"
                placeholder="14"
                defaultValue={editingTemplate?.validityDays ?? ""}
              />
              <span className="field-help">
                Days until proposal expires. Leave blank for no default.
              </span>
            </label>
          </div>
          <div className="supply-form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setOpen(false);
                setEditingId(null);
                setSelectedSections(
                  new Set(PROPOSAL_SECTIONS.map((s) => s.id)),
                );
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <TableSkeleton />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Visible sections</th>
              <th>Defaults</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeTemplates.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-ink-2">
                  No proposal templates yet. Create your first template to get
                  started.
                </td>
              </tr>
            ) : (
              activeTemplates.map((row) => (
                <tr key={row._id}>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td className="text-ink-2">{row.description || "—"}</td>
                  <td className="text-ink-2">
                    {formatVisibleSections(row.visibleSections)}
                  </td>
                  <td className="text-ink-2">
                    <div className="text-xs">
                      {row.defaultTaxRate != null
                        ? `Tax: ${formatPercentage(row.defaultTaxRate)}`
                        : null}
                      {row.defaultServiceChargePercent != null
                        ? ` Service: ${formatPercentage(row.defaultServiceChargePercent)}`
                        : null}
                      {row.validityDays != null
                        ? ` Valid: ${row.validityDays}d`
                        : null}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`badge badge-${
                        row.status === "active" ? "success" : "muted"
                      }`}
                    >
                      {STATUS_LABELS[row.status] || row.status}
                    </span>
                  </td>
                  <td className="text-right">
                    {row.status === "active" ? (
                      <>
                        <button
                          className="btn-link btn-link-compact"
                          onClick={() => {
                            setEditingId(row._id);
                            setSelectedSections(
                              new Set(row.visibleSections || []),
                            );
                            setOpen(true);
                          }}
                        >
                          Revise
                        </button>
                        <button
                          className="btn-link btn-link-compact text-ink-2"
                          onClick={() => setArchiveModal(row._id)}
                        >
                          Archive
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn-link btn-link-compact"
                        onClick={() => handleReactivate(row._id)}
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      {archiveModal && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h3>Archive template</h3>
            <p className="text-ink-2">
              Are you sure you want to archive this template? It will no longer
              be available for new proposals.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setArchiveModal(null)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleArchive}>
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
