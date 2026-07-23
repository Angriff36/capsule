import { useQuery } from "convex/react";
import { useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import type {
  ContractPdfClient,
  ContractPdfRecord,
} from "../clients/contractPdf";
import type { ProposalPdfRecord } from "../clients/proposalPdf";
import type {
  BeoDishLine,
  BeoEventRecord,
  BeoStaffLine,
} from "../events/beoPdf";
import { STAGE_LABEL, type EventStage } from "../events/eventStatus";
import type { InvoicePdfClient, InvoicePdfRecord } from "../finance/invoicePdf";
import "./clientPortal.css";

const PORTAL_STAGES: EventStage[] = [
  "planning",
  "pending_approval",
  "approved",
  "executing",
  "completed",
  "closed_out",
];

const STAGE_NOTE: Record<EventStage, string> = {
  planning: "Your catering team is shaping the event details.",
  pending_approval: "The plan is in its final confirmation pass.",
  approved: "The event plan is confirmed and moving into preparation.",
  executing: "Your event is in service now.",
  completed: "Service is complete. The team is wrapping up.",
  cancelled: "This event is no longer moving forward.",
  closed_out: "Your event is complete and fully wrapped up.",
};

const HEX_COLOR = /^#[0-9a-f]{6}$/iu;
const DEFAULT_PRIMARY = "#233E35";
const DEFAULT_ACCENT = "#BE773F";

export interface ClientPortalSnapshot {
  organization: {
    displayName: string;
    address: string | null;
    primaryColor: string | null;
    accentColor: string | null;
  };
  event: {
    title: string;
    eventType: string;
    startsAt: number | null;
    endsAt: number | null;
    expectedHeadcount: number;
    stage: EventStage;
  };
  menu: Array<{
    id: string;
    name: string;
    description: string | null;
    course: string | null;
    serviceStyle: string | null;
    quantityServings: number;
  }>;
  documents?: {
    client: ContractPdfClient & InvoicePdfClient;
    clientName: string;
    contracts: ContractPdfRecord[];
    proposals: Array<ProposalPdfRecord & { acceptedAt?: number | null }>;
    invoices: InvoicePdfRecord[];
    beo: {
      event: BeoEventRecord;
      dishes: BeoDishLine[];
      timeline: Array<{
        name: string;
        startsAt?: number | null;
        endsAt?: number | null;
        responsibleParty?: string | null;
        notes?: string | null;
      }>;
      staff: BeoStaffLine[];
    };
  };
}

type PortalStyle = CSSProperties & {
  "--portal-primary": string;
  "--portal-accent": string;
};

export function ClientPortalPage({ token: tokenProp }: { token?: string }) {
  const { token: routeToken } = useParams();
  const token = tokenProp ?? routeToken;
  const portal = useQuery(
    api.clientPortal.getEvent,
    token ? { token } : "skip",
  ) as ClientPortalSnapshot | null | undefined;

  if (!token || portal === null) return <ClientPortalUnavailable />;
  if (portal === undefined) return <ClientPortalLoading />;
  return <ClientPortalView portal={portal} />;
}

export function ClientPortalView({ portal }: { portal: ClientPortalSnapshot }) {
  const primary = validBrandColor(
    portal.organization.primaryColor,
    DEFAULT_PRIMARY,
  );
  const accent = validBrandColor(
    portal.organization.accentColor,
    DEFAULT_ACCENT,
  );
  const portalStyle: PortalStyle = {
    "--portal-primary": primary,
    "--portal-accent": accent,
  };
  const currentStageIndex = PORTAL_STAGES.indexOf(portal.event.stage);
  const statusLabel = STAGE_LABEL[portal.event.stage];
  const brandInitial =
    portal.organization.displayName.trim().charAt(0).toUpperCase() || "C";

  return (
    <main className="client-portal" style={portalStyle}>
      <div className="client-portal-orbit client-portal-orbit-one" />
      <div className="client-portal-orbit client-portal-orbit-two" />

      <article className="client-portal-sheet">
        <header className="client-portal-masthead">
          <div className="client-portal-brandmark" aria-hidden="true">
            {brandInitial}
          </div>
          <div>
            <p className="client-portal-eyebrow">A live event view from</p>
            <p className="client-portal-brand-name">
              {portal.organization.displayName}
            </p>
            {portal.organization.address ? (
              <p className="client-portal-address">
                {portal.organization.address}
              </p>
            ) : null}
          </div>
          <p className="client-portal-readonly">Read-only client view</p>
        </header>

        <section className="client-portal-hero">
          <div className="client-portal-title-block">
            <p className="client-portal-kicker">
              {humanize(portal.event.eventType)}
            </p>
            <h1>{portal.event.title}</h1>
            <p className="client-portal-intro">
              The details that matter, kept current by your catering team.
            </p>
          </div>
          <div className="client-portal-status-card">
            <span>Current status</span>
            <strong>{statusLabel}</strong>
            <p>{STAGE_NOTE[portal.event.stage]}</p>
          </div>
        </section>

        <section className="client-portal-facts" aria-label="Event details">
          <div className="client-portal-date-block">
            <p>Confirmed date</p>
            {portal.event.startsAt == null ? (
              <strong>Being confirmed</strong>
            ) : (
              <>
                <span>{formatWeekday(portal.event.startsAt)}</span>
                <strong>{formatCalendarDate(portal.event.startsAt)}</strong>
                <small>
                  {formatTimeRange(portal.event.startsAt, portal.event.endsAt)}
                </small>
              </>
            )}
          </div>
          <div className="client-portal-headcount-block">
            <p>Confirmed headcount</p>
            <strong>
              {new Intl.NumberFormat().format(portal.event.expectedHeadcount)}
            </strong>
            <span>guests</span>
          </div>
        </section>

        <section
          className="client-portal-progress"
          aria-labelledby="progress-title"
        >
          <div className="client-portal-section-heading">
            <p>Event progress</p>
            <h2 id="progress-title">From plan to final toast</h2>
          </div>

          {portal.event.stage === "cancelled" ? (
            <p className="client-portal-cancelled">
              This event has been cancelled. Contact your catering team if you
              have any questions.
            </p>
          ) : (
            <ol className="client-portal-timeline">
              {PORTAL_STAGES.map((stage, index) => {
                const state =
                  index < currentStageIndex
                    ? "complete"
                    : index === currentStageIndex
                      ? "current"
                      : "upcoming";
                return (
                  <li key={stage} data-state={state}>
                    <span aria-hidden="true">{index + 1}</span>
                    <p>{STAGE_LABEL[stage]}</p>
                    {state === "current" ? (
                      <small aria-current="step">You are here</small>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <ClientPortalDocumentLibrary portal={portal} />

        <section className="client-portal-menu" aria-labelledby="menu-title">
          <div className="client-portal-section-heading">
            <p>Your selected menu</p>
            <h2 id="menu-title">The table, taking shape</h2>
          </div>

          {portal.menu.length === 0 ? (
            <div className="client-portal-empty-menu">
              <strong>Menu selections are being finalized.</strong>
              <p>Confirmed dishes will appear here as soon as they are set.</p>
            </div>
          ) : (
            <ol className="client-portal-menu-list">
              {portal.menu.map((item, index) => (
                <li key={item.id}>
                  <span className="client-portal-menu-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <div className="client-portal-menu-line">
                      <h3>{item.name}</h3>
                      {item.course ? (
                        <span>{humanize(item.course)}</span>
                      ) : null}
                    </div>
                    {item.description ? <p>{item.description}</p> : null}
                    <small>
                      {[
                        item.serviceStyle ? humanize(item.serviceStyle) : null,
                        `${new Intl.NumberFormat().format(item.quantityServings)} servings`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="client-portal-footer">
          <p>
            This page is a live, read-only view. Your catering team manages all
            updates.
          </p>
          <span>{portal.organization.displayName}</span>
        </footer>
      </article>
    </main>
  );
}

type DownloadState =
  | { key: string; status: "working" }
  | { key: string; status: "done" }
  | { key: string; status: "error"; message: string }
  | null;

function ClientPortalDocumentLibrary({
  portal,
}: {
  portal: ClientPortalSnapshot;
}) {
  const [downloadState, setDownloadState] = useState<DownloadState>(null);
  const documents = portal.documents;

  if (!documents) {
    return (
      <section
        className="client-portal-documents"
        aria-labelledby="documents-title"
      >
        <div className="client-portal-section-heading">
          <p>Your document library</p>
          <h2 id="documents-title">Signed, settled, and close at hand</h2>
        </div>
        <div className="client-portal-documents-empty">
          <strong>Your documents are being connected.</strong>
          <p>Refresh shortly to retrieve the latest event PDFs.</p>
        </div>
      </section>
    );
  }

  const branding = {
    displayName: portal.organization.displayName,
    address: portal.organization.address ?? "",
    primaryColor: validBrandColor(
      portal.organization.primaryColor,
      DEFAULT_PRIMARY,
    ),
    accentColor: validBrandColor(
      portal.organization.accentColor,
      DEFAULT_ACCENT,
    ),
  };
  const commercialCount =
    documents.contracts.length +
    documents.proposals.length +
    documents.invoices.length;
  const documentCount = commercialCount + 1;

  const runDownload = async (key: string, task: () => Promise<void>) => {
    setDownloadState({ key, status: "working" });
    try {
      await task();
      setDownloadState({ key, status: "done" });
    } catch (error) {
      setDownloadState({
        key,
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "This PDF could not be prepared. Please try again.",
      });
    }
  };

  return (
    <section
      className="client-portal-documents"
      aria-labelledby="documents-title"
    >
      <div className="client-portal-documents-heading">
        <div className="client-portal-section-heading">
          <p>Your document library</p>
          <h2 id="documents-title">Signed, settled, and close at hand</h2>
        </div>
        <p className="client-portal-document-count">
          <strong>{String(documentCount).padStart(2, "0")}</strong>
          <span>{documentCount === 1 ? "PDF ready" : "PDFs ready"}</span>
        </p>
      </div>

      {commercialCount === 0 ? (
        <p className="client-portal-documents-note">
          Signed agreements, accepted proposals, and issued invoices will join
          this library automatically. Your live BEO is ready now.
        </p>
      ) : null}

      <div className="client-portal-document-grid">
        {documents.contracts.map((contract) => {
          const key = `contract:${contract._id}`;
          return (
            <DocumentCard
              key={key}
              documentKey={key}
              kind="contract"
              eyebrow="Signed contract"
              title={contract.title}
              reference={contract.contractNumber || "Executed agreement"}
              detail={`Signed ${formatDocumentDate(contract.signedAt)}`}
              state={downloadState}
              onDownload={() =>
                runDownload(key, async () => {
                  const { downloadContractPdf } =
                    await import("../clients/contractPdf");
                  await downloadContractPdf({
                    contract,
                    client: documents.client,
                    event: documents.beo.event,
                    branding,
                  });
                })
              }
            />
          );
        })}

        {documents.proposals.map((proposal) => {
          const key = `proposal:${proposal._id}`;
          return (
            <DocumentCard
              key={key}
              documentKey={key}
              kind="proposal"
              eyebrow="Accepted proposal"
              title={proposal.title}
              reference={proposal.proposalNumber || "Accepted offer"}
              detail={`${formatMoney(proposal.total)} · accepted ${formatDocumentDate(proposal.acceptedAt)}`}
              state={downloadState}
              onDownload={() =>
                runDownload(key, async () => {
                  const { downloadProposalPdf } =
                    await import("../clients/proposalPdf");
                  await downloadProposalPdf({
                    proposal,
                    clientName: documents.clientName,
                    branding,
                  });
                })
              }
            />
          );
        })}

        {documents.invoices.map((invoice) => {
          const key = `invoice:${invoice._id}`;
          return (
            <DocumentCard
              key={key}
              documentKey={key}
              kind="invoice"
              eyebrow={`${humanize(invoice.status)} invoice`}
              title={invoice.invoiceNumber || "Current invoice"}
              reference={`${formatMoney(invoice.amountDue)} balance`}
              detail={`Issued ${formatDocumentDate(invoice.issuedAt ?? invoice.createdAt)}`}
              state={downloadState}
              onDownload={() =>
                runDownload(key, async () => {
                  const { downloadInvoicePdf } =
                    await import("../finance/invoicePdf");
                  await downloadInvoicePdf({
                    invoice,
                    client: documents.client,
                    event: documents.beo.event,
                    branding,
                  });
                })
              }
            />
          );
        })}

        <DocumentCard
          documentKey="beo:current"
          kind="beo"
          eyebrow="Current BEO"
          title="Banquet event order"
          reference="Live event document"
          detail="Menu, timeline, staffing, and service details"
          state={downloadState}
          onDownload={() =>
            runDownload("beo:current", async () => {
              const { downloadBeoPdf } = await import("../events/beoPdf");
              await downloadBeoPdf({
                ...documents.beo,
                clientName: documents.clientName,
                branding,
              });
            })
          }
        />
      </div>

      <p
        className="client-portal-download-status"
        role="status"
        aria-live="polite"
      >
        {downloadState?.status === "done"
          ? "Your PDF download has started."
          : downloadState?.status === "error"
            ? downloadState.message
            : ""}
      </p>
    </section>
  );
}

function DocumentCard({
  documentKey,
  kind,
  eyebrow,
  title,
  reference,
  detail,
  state,
  onDownload,
}: {
  documentKey: string;
  kind: "contract" | "proposal" | "invoice" | "beo";
  eyebrow: string;
  title: string;
  reference: string;
  detail: string;
  state: DownloadState;
  onDownload: () => void;
}) {
  const working = state?.key === documentKey && state.status === "working";
  const done = state?.key === documentKey && state.status === "done";

  return (
    <article className="client-portal-document-card" data-document-kind={kind}>
      <div className="client-portal-document-index" aria-hidden="true">
        {kind === "contract"
          ? "C"
          : kind === "proposal"
            ? "P"
            : kind === "invoice"
              ? "I"
              : "B"}
      </div>
      <div className="client-portal-document-copy">
        <p>{eyebrow}</p>
        <h3>{title}</h3>
        <strong>{reference}</strong>
        <span>{detail}</span>
      </div>
      <button
        type="button"
        disabled={working}
        onClick={onDownload}
        aria-label={`Download ${title} PDF`}
      >
        {working ? "Preparing…" : done ? "Downloaded" : "Download PDF"}
        <span aria-hidden="true">↓</span>
      </button>
    </article>
  );
}

function ClientPortalLoading() {
  return (
    <main className="client-portal client-portal-state-page" aria-busy="true">
      <div className="client-portal-state-card">
        <div className="client-portal-state-mark" aria-hidden="true">
          C
        </div>
        <p className="client-portal-eyebrow">Opening your event view</p>
        <h1>Gathering the latest details…</h1>
        <div className="client-portal-loading-line" />
      </div>
    </main>
  );
}

export function ClientPortalUnavailable() {
  return (
    <main className="client-portal client-portal-state-page">
      <div className="client-portal-state-card">
        <div className="client-portal-state-mark" aria-hidden="true">
          C
        </div>
        <p className="client-portal-eyebrow">Client event view</p>
        <h1>This link isn’t available.</h1>
        <p>
          It may be incomplete or no longer match an event. Ask your catering
          contact for the current client link.
        </p>
      </div>
    </main>
  );
}

function validBrandColor(value: string | null, fallback: string): string {
  const candidate = value?.trim() ?? "";
  return HEX_COLOR.test(candidate) ? candidate : fallback;
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function formatWeekday(value: number): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(value);
}

function formatCalendarDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatTimeRange(startsAt: number, endsAt: number | null): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const start = formatter.format(startsAt);
  return endsAt == null ? start : `${start} – ${formatter.format(endsAt)}`;
}

function formatDocumentDate(value: number | null | undefined): string {
  if (value == null) return "date not recorded";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(value);
}
