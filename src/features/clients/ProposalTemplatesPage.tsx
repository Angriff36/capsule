import { useState, type FormEvent } from "react";
import {
  useCreateProposalTemplate,
  useProposalTemplateArchive,
  useProposalTemplateReactivate,
  useProposalTemplateRevise,
  useListProposalTemplate,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { EmptyState, StatusChip, TableSkeleton } from "../../ui/primitives";
import { ClientsWorkspaceNav } from "./ClientsWorkspaceNav";
import { CrmFailureBanner } from "./CrmFailureBanner";

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

const ALL_SECTION_IDS = () => new Set(PROPOSAL_SECTIONS.map((s) => s.id));

function parsePercentage(value: FormDataEntryValue | null): number | undefined {
  if (!value) return undefined;
  const num = parseFloat(String(value));
  return Number.isFinite(num) && num >= 0 && num <= 100 ? num / 100 : undefined;
}

/** Table display: stored fraction → "8.50%". */
function formatPercentage(value: number | null | undefined): string {
  if (value == null) return "";
  return `${(value * 100).toFixed(2)}%`;
}

/** Number-input default: stored fraction → "8.5" (a % sign would blank the input). */
function percentInputValue(value: number | null | undefined): string {
  if (value == null) return "";
  return String(Math.round((value * 100 + Number.EPSILON) * 100) / 100);
}

function formatVisibleSections(value: string[] | null | undefined): string {
  if (!value || !value.length) return "All sections";
  return value
    .map((id) => PROPOSAL_SECTIONS.find((s) => s.id === id)?.label || id)
    .join(", ");
}

export function ProposalTemplatesPage() {
  const templates = useListProposalTemplate();
  // Creation path: the governed create hook (ProposalTemplate_createViaDefine),
  // not the entity-command hook which targets an existing doc via docId.
  const define = useCreateProposalTemplate();
  const revise = useProposalTemplateRevise();
  const archive = useProposalTemplateArchive();
  const reactivate = useProposalTemplateReactivate();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [selectedSections, setSelectedSections] =
    useState<Set<string>>(ALL_SECTION_IDS);
  const { prompt, host } = useActionPrompt(busy);

  const activeTemplates = (templates ?? []).filter(
    (row) => row.deletedAt == null,
  );

  const closeForm = () => {
    setOpen(false);
    setEditingId(null);
    setSelectedSections(ALL_SECTION_IDS());
  };

  const openForCreate = () => {
    setEditingId(null);
    setSelectedSections(ALL_SECTION_IDS());
    setOpen(true);
  };

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
        closeForm();
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
          docId: id,
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
        closeForm();
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  const handleArchive = (id: string) => {
    void (async () => {
      const reason = await prompt.askReason({
        title: "Archive template",
        description:
          "The template stops being offered for new proposals. Existing proposals keep their content, and you can reactivate it anytime.",
        label: "Archive reason",
        placeholder: "e.g. Replaced by the 2027 wedding template",
        confirmLabel: "Archive template",
        tone: "danger",
      });
      if (!reason) return;
      setFailure(null);
      setBusy(true);
      try {
        await archive({ docId: id, reason });
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  const handleReactivate = async (id: string) => {
    setFailure(null);
    setBusy(true);
    try {
      await reactivate({ docId: id });
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
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

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Clients · Proposal templates</p>
          <h1 className="display-title mt-2">Proposal templates</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Start new proposals from a template — your standard terms, sections,
            and tax rates come pre-filled, so every proposal looks the same and
            takes half the time.
          </p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => (open ? closeForm() : openForCreate())}
        >
          {open ? "Close" : "New template"}
        </button>
      </header>

      <ClientsWorkspaceNav />
      {failure ? <CrmFailureBanner error={failure} /> : null}
      {host}

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
                defaultValue={percentInputValue(
                  editingTemplate?.defaultTaxRate,
                )}
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
                defaultValue={percentInputValue(
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
              onClick={closeForm}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Library</p>
            <h2>Templates</h2>
          </div>
          <span>{loading ? "…" : activeTemplates.length}</span>
        </div>
        {loading ? (
          <TableSkeleton />
        ) : activeTemplates.length === 0 ? (
          <EmptyState
            title="No proposal templates yet"
            hint="Create your first template to get started."
            action={
              <button
                type="button"
                className="btn btn-primary"
                onClick={openForCreate}
              >
                New template
              </button>
            }
          />
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
              {activeTemplates.map((row) => (
                <tr key={row._id}>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td className="text-ink-2">{row.description || "—"}</td>
                  <td className="text-ink-2">
                    {formatVisibleSections(row.visibleSections)}
                  </td>
                  <td className="text-ink-2">
                    <div className="text-2xs">
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
                    <StatusChip status={row.status} />
                  </td>
                  <td className="text-right">
                    {row.status === "active" ? (
                      <>
                        <button
                          className="btn-link btn-link-compact"
                          disabled={busy}
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
                          disabled={busy}
                          onClick={() => handleArchive(row._id)}
                        >
                          Archive
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn-link btn-link-compact"
                        disabled={busy}
                        onClick={() => void handleReactivate(row._id)}
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
