import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateClient,
  useCreateClientContact,
  useCreateLead,
  useCreateProposal,
  useLeadConfirmConversion,
  useLeadConfirmProposalSent,
  useLeadStageConversion,
  useLeadStageProposal,
  useLeadUpdatePipeline,
  useListLead,
  useProposalSend,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { CLIENTS_ROUTES } from "./clientsRoutes";
import { ClientsWorkspaceNav } from "./ClientsWorkspaceNav";
import { CrmFailureBanner } from "./CrmFailureBanner";
import "./LeadPipelinePage.css";

const STAGES = [
  { key: "new", label: "New", caption: "Fresh inquiries" },
  { key: "qualified", label: "Qualified", caption: "A real fit" },
  {
    key: "proposalSent",
    label: "Proposal sent",
    caption: "Offer in hand",
  },
  { key: "negotiating", label: "Negotiating", caption: "Closing details" },
] as const;

type LeadStage = (typeof STAGES)[number]["key"];

interface LeadRow {
  _id: string;
  version: number;
  leadType: "company" | "person";
  companyName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  email?: string | null;
  phone?: string | null;
  source: string;
  estimatedValue: number;
  stage: LeadStage;
  probability: number;
  notes?: string | null;
  clientId?: string | null;
  clientContactId?: string | null;
  proposalId?: string | null;
  capturedAt?: number | null;
  convertedAt?: number | null;
  proposalLinkedAt?: number | null;
  deletedAt?: number | null;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function optional(value: FormDataEntryValue | null): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed || undefined;
}

function amount(value: FormDataEntryValue | null): number {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function leadName(lead: LeadRow): string {
  if (lead.leadType === "company") return lead.companyName || "Unnamed company";
  return (
    [lead.givenName, lead.familyName].filter(Boolean).join(" ") ||
    "Unnamed lead"
  );
}

function dateValue(value: FormDataEntryValue | null): number | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const parsed = new Date(`${raw}T12:00:00`).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function LeadPipelinePage() {
  const leads = useListLead();
  const createLead = useCreateLead();
  const updatePipeline = useLeadUpdatePipeline();
  const createClient = useCreateClient();
  const createClientContact = useCreateClientContact();
  const stageConversion = useLeadStageConversion();
  const confirmConversion = useLeadConfirmConversion();
  const createProposal = useCreateProposal();
  const sendProposal = useProposalSend();
  const stageProposal = useLeadStageProposal();
  const confirmProposalSent = useLeadConfirmProposalSent();

  const [showCapture, setShowCapture] = useState(false);
  const [leadType, setLeadType] = useState<"company" | "person">("company");
  const [proposalLeadId, setProposalLeadId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeLeads = ((leads ?? []) as LeadRow[]).filter(
    (lead) => lead.deletedAt == null && lead.capturedAt != null,
  );

  const metrics = useMemo(() => {
    const faceValue = activeLeads.reduce(
      (sum, lead) => sum + Number(lead.estimatedValue || 0),
      0,
    );
    const weightedValue = activeLeads.reduce(
      (sum, lead) =>
        sum +
        Number(lead.estimatedValue || 0) *
          (Number(lead.probability || 0) / 100),
      0,
    );
    return {
      count: activeLeads.length,
      faceValue,
      weightedValue,
      proposalCount: activeLeads.filter((lead) => lead.proposalId != null)
        .length,
    };
  }, [activeLeads]);

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitCapture = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const estimatedValue = amount(data.get("estimatedValue"));
    const probability = amount(data.get("probability"));
    if (!Number.isFinite(estimatedValue) || !Number.isFinite(probability)) {
      setFailure(new Error("Estimated value and probability must be numbers."));
      return;
    }
    void run("capture", async () => {
      await createLead({
        leadType,
        companyName: optional(data.get("companyName")),
        givenName: optional(data.get("givenName")),
        familyName: optional(data.get("familyName")),
        email: optional(data.get("email")),
        phone: optional(data.get("phone")),
        source: String(data.get("source") ?? "").trim(),
        estimatedValue,
        probability,
        notes: optional(data.get("notes")),
      });
      form.reset();
      setLeadType("company");
      setShowCapture(false);
      setNotice("Lead captured in the new-inquiry column.");
    });
  };

  const submitPipelineUpdate = (
    lead: LeadRow,
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const estimatedValue = amount(data.get("estimatedValue"));
    const probability = amount(data.get("probability"));
    if (!Number.isFinite(estimatedValue) || !Number.isFinite(probability)) {
      setFailure(new Error("Estimated value and probability must be numbers."));
      return;
    }
    void run(`${lead._id}:pipeline`, async () => {
      await updatePipeline({
        docId: lead._id,
        version: lead.version,
        stage: String(data.get("stage")) as LeadStage,
        estimatedValue,
        probability,
      });
      setNotice(`${leadName(lead)} pipeline updated.`);
    });
  };

  const convertLead = (lead: LeadRow) => {
    void run(`${lead._id}:convert`, async () => {
      const createdClient = await createClient({
        clientType: lead.leadType,
        companyName: lead.companyName || undefined,
        givenName: lead.givenName || undefined,
        familyName: lead.familyName || undefined,
        email: lead.email || undefined,
        phone: lead.phone || undefined,
        paymentTermsDays: 30,
        taxExempt: false,
        notes: lead.notes || `Converted from ${lead.source} lead.`,
      });
      const clientId = String(createdClient.docId);
      let clientContactId: string | undefined;

      if (lead.leadType === "company" && lead.givenName) {
        const createdContact = await createClientContact({
          clientId,
          givenName: lead.givenName,
          familyName: lead.familyName || undefined,
          email: lead.email || undefined,
          phone: lead.phone || undefined,
          isPrimary: true,
          isBillingContact: true,
          notes: "Created from the lead pipeline.",
        });
        clientContactId = String(createdContact.docId);
      }

      const staged = await stageConversion({
        docId: lead._id,
        version: lead.version,
        clientId,
        clientContactId,
      });
      await confirmConversion({
        docId: lead._id,
        version: Number(staged.version),
      });
      setNotice(
        clientContactId
          ? `${leadName(lead)} converted to a client with a primary contact.`
          : `${leadName(lead)} converted to a client account.`,
      );
    });
  };

  const submitProposal = (lead: LeadRow, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!lead.clientId) {
      setFailure(
        new Error("Convert this lead to a client before creating a proposal."),
      );
      return;
    }
    const proposalValue = amount(data.get("proposalValue"));
    if (!Number.isFinite(proposalValue) || proposalValue < 0) {
      setFailure(new Error("Proposal value must be a non-negative number."));
      return;
    }
    void run(`${lead._id}:proposal`, async () => {
      const created = await createProposal({
        clientId: lead.clientId,
        title: String(data.get("title") ?? "").trim(),
        subtotal: proposalValue,
        taxAmount: 0,
        discountAmount: 0,
        total: proposalValue,
        guestCount: Number(data.get("guestCount") || 0) || 0,
        eventType: optional(data.get("eventType")),
        eventDate: dateValue(data.get("eventDate")),
        notes: lead.notes || undefined,
      });
      const proposalId = String(created.docId);
      await sendProposal({ docId: proposalId, version: 1 });
      const staged = await stageProposal({
        docId: lead._id,
        version: lead.version,
        proposalId,
      });
      await confirmProposalSent({
        docId: lead._id,
        version: Number(staged.version),
      });
      form.reset();
      setProposalLeadId(null);
      setNotice(`Proposal sent and linked to ${leadName(lead)}.`);
    });
  };

  if (leads === undefined) return <TableSkeleton rows={8} />;

  return (
    <div className="operations-stage supply-stage lead-pipeline-stage">
      <header className="supply-masthead lead-pipeline-masthead">
        <div>
          <p className="eyebrow">Clients · Pipeline</p>
          <h1 className="display-title mt-2">Lead pipeline</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Capture the inquiry first. Qualify the work, forecast its value,
            then create the client and proposal only when the conversation is
            ready.
          </p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => setShowCapture((value) => !value)}
        >
          {showCapture ? "Close form" : "Capture lead"}
        </button>
      </header>

      <ClientsWorkspaceNav />

      <section className="lead-pipeline-metrics" aria-label="Pipeline summary">
        <article>
          <span>Open inquiries</span>
          <strong>{metrics.count}</strong>
          <small>Across all four stages</small>
        </article>
        <article>
          <span>Pipeline value</span>
          <strong>{currency.format(metrics.faceValue)}</strong>
          <small>Unweighted opportunity</small>
        </article>
        <article className="is-forecast">
          <span>Weighted forecast</span>
          <strong>{currency.format(metrics.weightedValue)}</strong>
          <small>Value × close probability</small>
        </article>
        <article>
          <span>Formal proposals</span>
          <strong>{metrics.proposalCount}</strong>
          <small>Created from this pipeline</small>
        </article>
      </section>

      {failure ? <CrmFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="lead-pipeline-notice" role="status">
          {notice}
        </p>
      ) : null}

      {showCapture ? (
        <form className="lead-capture-form" onSubmit={submitCapture}>
          <div className="lead-capture-heading">
            <div>
              <p className="eyebrow">New inquiry</p>
              <h2>Capture what you know</h2>
            </div>
            <p>Nothing here creates a client or proposal yet.</p>
          </div>
          <div className="lead-capture-grid">
            <label>
              Lead type
              <select
                name="leadType"
                value={leadType}
                onChange={(event) =>
                  setLeadType(event.target.value as "company" | "person")
                }
              >
                <option value="company">Company</option>
                <option value="person">Person</option>
              </select>
            </label>
            {leadType === "company" ? (
              <label className="lead-capture-span-2">
                Company name
                <input name="companyName" required autoFocus />
              </label>
            ) : (
              <>
                <label>
                  Given name
                  <input name="givenName" required autoFocus />
                </label>
                <label>
                  Family name
                  <input name="familyName" />
                </label>
              </>
            )}
            {leadType === "company" ? (
              <>
                <label>
                  Contact given name
                  <input name="givenName" />
                </label>
                <label>
                  Contact family name
                  <input name="familyName" />
                </label>
              </>
            ) : null}
            <label>
              Source
              <input name="source" list="lead-sources" required />
              <datalist id="lead-sources">
                <option value="Website" />
                <option value="Referral" />
                <option value="Phone" />
                <option value="Email" />
                <option value="Venue partner" />
                <option value="Social" />
              </datalist>
            </label>
            <label>
              Estimated value
              <input
                name="estimatedValue"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </label>
            <label>
              Probability
              <span className="lead-input-suffix">
                <input
                  name="probability"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue="10"
                  aria-label="Probability"
                  required
                />
                <span>%</span>
              </span>
            </label>
            <label>
              Email
              <input name="email" type="email" />
            </label>
            <label>
              Phone
              <input name="phone" type="tel" />
            </label>
            <label className="lead-capture-span-2">
              Inquiry notes
              <textarea name="notes" rows={3} />
            </label>
          </div>
          <div className="lead-capture-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy != null}
            >
              {busy === "capture" ? "Capturing…" : "Add to pipeline"}
            </button>
          </div>
        </form>
      ) : null}

      <section className="lead-pipeline-board" aria-label="Lead stages">
        {STAGES.map((stage) => {
          const stageLeads = activeLeads.filter(
            (lead) => lead.stage === stage.key,
          );
          const stageValue = stageLeads.reduce(
            (sum, lead) => sum + Number(lead.estimatedValue || 0),
            0,
          );
          return (
            <section
              className="lead-pipeline-column"
              data-stage={stage.key}
              key={stage.key}
              aria-labelledby={`lead-stage-${stage.key}`}
            >
              <header>
                <div>
                  <span>{String(stageLeads.length).padStart(2, "0")}</span>
                  <h2 id={`lead-stage-${stage.key}`}>{stage.label}</h2>
                  <p>{stage.caption}</p>
                </div>
                <strong>{currency.format(stageValue)}</strong>
              </header>

              <div className="lead-pipeline-stack">
                {stageLeads.length === 0 ? (
                  <p className="lead-pipeline-empty">No leads here yet.</p>
                ) : null}
                {stageLeads.map((lead, index) => (
                  <article
                    className="lead-card"
                    key={lead._id}
                    style={{ "--lead-index": index } as CSSProperties}
                    data-testid={`lead-card-${lead._id}`}
                  >
                    <div className="lead-card-topline">
                      <span>{lead.source}</span>
                      <time
                        dateTime={new Date(lead.capturedAt ?? 0).toISOString()}
                      >
                        {new Date(lead.capturedAt ?? 0).toLocaleDateString(
                          undefined,
                          {
                            month: "short",
                            day: "numeric",
                          },
                        )}
                      </time>
                    </div>
                    <h3>{leadName(lead)}</h3>
                    {lead.leadType === "company" && lead.givenName ? (
                      <p className="lead-card-contact">
                        {[lead.givenName, lead.familyName]
                          .filter(Boolean)
                          .join(" ")}
                      </p>
                    ) : null}
                    <div className="lead-card-value">
                      <strong>{currency.format(lead.estimatedValue)}</strong>
                      <span>{lead.probability}% likely</span>
                    </div>
                    <div className="lead-probability-track" aria-hidden="true">
                      <span style={{ width: `${lead.probability}%` }} />
                    </div>
                    {lead.notes ? (
                      <p className="lead-card-notes">{lead.notes}</p>
                    ) : null}

                    <form
                      className="lead-card-editor"
                      onSubmit={(event) => submitPipelineUpdate(lead, event)}
                    >
                      <label>
                        <span>Stage</span>
                        <select
                          name="stage"
                          defaultValue={lead.stage}
                          aria-label={`${leadName(lead)} stage`}
                        >
                          {STAGES.map((option) => (
                            <option key={option.key} value={option.key}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Value</span>
                        <input
                          name="estimatedValue"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={lead.estimatedValue}
                          aria-label={`${leadName(lead)} estimated value`}
                        />
                      </label>
                      <label>
                        <span>Chance</span>
                        <input
                          name="probability"
                          type="number"
                          min="0"
                          max="100"
                          defaultValue={lead.probability}
                          aria-label={`${leadName(lead)} probability`}
                        />
                      </label>
                      <button
                        className="btn btn-ghost"
                        type="submit"
                        disabled={busy != null}
                      >
                        Save
                      </button>
                    </form>

                    <div className="lead-card-actions">
                      {lead.convertedAt == null ? (
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => convertLead(lead)}
                          disabled={busy != null}
                        >
                          {busy === `${lead._id}:convert`
                            ? "Converting…"
                            : "Convert to client"}
                        </button>
                      ) : (
                        <>
                          {lead.clientId ? (
                            <Link
                              className="text-link"
                              to={CLIENTS_ROUTES.detail(lead.clientId)}
                            >
                              Open client
                            </Link>
                          ) : null}
                          {lead.proposalId == null ? (
                            <button
                              className="btn btn-secondary"
                              type="button"
                              onClick={() =>
                                setProposalLeadId((current) =>
                                  current === lead._id ? null : lead._id,
                                )
                              }
                              disabled={busy != null}
                            >
                              Create proposal
                            </button>
                          ) : (
                            <Link
                              className="text-link"
                              to={CLIENTS_ROUTES.proposals}
                            >
                              Open proposal
                            </Link>
                          )}
                        </>
                      )}
                    </div>

                    {proposalLeadId === lead._id ? (
                      <form
                        className="lead-proposal-form"
                        onSubmit={(event) => submitProposal(lead, event)}
                      >
                        <p>
                          Create the offer and mark it sent in one explicit
                          action.
                        </p>
                        <label>
                          Proposal title
                          <input
                            name="title"
                            defaultValue={`${leadName(lead)} catering proposal`}
                            required
                          />
                        </label>
                        <div>
                          <label>
                            Value
                            <input
                              name="proposalValue"
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={lead.estimatedValue}
                              required
                            />
                          </label>
                          <label>
                            Guests
                            <input
                              name="guestCount"
                              type="number"
                              min="0"
                              defaultValue="0"
                            />
                          </label>
                        </div>
                        <div>
                          <label>
                            Event type
                            <input name="eventType" />
                          </label>
                          <label>
                            Event date
                            <input name="eventDate" type="date" />
                          </label>
                        </div>
                        <button
                          className="btn btn-primary"
                          type="submit"
                          disabled={busy != null}
                        >
                          {busy === `${lead._id}:proposal`
                            ? "Creating…"
                            : "Create & mark sent"}
                        </button>
                      </form>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </section>
    </div>
  );
}
