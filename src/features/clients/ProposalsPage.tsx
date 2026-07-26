import { Fragment, useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useCreateProposal,
  useListClient,
  useListEvent,
  useListEventTimelineActivity,
  useListVenue,
  useListProposal,
  useListProposalRevision,
  useProposalAccept,
  useProposalDecline,
  useProposalExpire,
  useProposalMarkViewed,
  useProposalSend,
  useCreateSignatureRequest,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { DraftRestoreBanner, useFormDraft } from "../../ui/formDraft";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { clientDisplayName } from "../events/clientName";
import { eventCreatePath } from "../events/eventRoutes";
import { useTenantBranding } from "../admin/tenantBranding";
import { CLIENTS_ROUTES } from "./clientsRoutes";
import { ClientsWorkspaceNav } from "./ClientsWorkspaceNav";
import { CrmFailureBanner } from "./CrmFailureBanner";
import { CrmLifecyclePolicy } from "./CrmLifecyclePolicy";
import {
  downloadProposalPdf,
  transformTimelineActivities,
  transformVenueLogistics,
  type ProposalPdfRecord,
} from "./proposalPdf";
import { ProposalMenuSelectionPanel } from "./ProposalMenuSelectionPanel";

// Event stages the acceptance cascade can feed dishes into (matches the
// EventDish.confirmFromProposal stage guard).
const LINKABLE_EVENT_STAGES = [
  "planning",
  "pending_approval",
  "approved",
  "executing",
];

// Proposal statuses where the client is still choosing dishes.
const MENU_EDITABLE_STATUSES = ["draft", "sent", "viewed"];

const policy = new CrmLifecyclePolicy();

const money = (value: FormDataEntryValue | null) => {
  const amount = Number(String(value ?? "").trim());
  return Number.isFinite(amount) ? amount : Number.NaN;
};

const dateValue = (value: FormDataEntryValue | null, endOfDay = false) => {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const timestamp = new Date(
    `${raw}T${endOfDay ? "23:59:59.999" : "12:00:00.000"}`,
  ).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
};

const defaultValidityDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateInputFromEpoch = (ms: number | null | undefined) => {
  if (ms == null || !Number.isFinite(ms)) return undefined;
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function ProposalsPage() {
  const { branding } = useTenantBranding();
  const proposals = useListProposal();
  const clients = useListClient();
  const events = useListEvent();
  const timelineActivities = useListEventTimelineActivity();
  const venues = useListVenue();
  const proposalRevisions = useListProposalRevision();
  const createProposal = useCreateProposal();
  const send = useProposalSend();
  const markViewed = useProposalMarkViewed();
  const accept = useProposalAccept();
  const decline = useProposalDecline();
  const expire = useProposalExpire();
  const createSignatureRequest = useCreateSignatureRequest();
  const [showDraft, setShowDraft] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);
  const draftForm = useFormDraft("proposal");

  const activeClients = (clients ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.registeredAt != null &&
      String(row.status) === "active",
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const fromEventId = searchParams.get("event");
  const fromEvent =
    fromEventId && events
      ? (events ?? []).find(
          (row) => row._id === fromEventId && row.deletedAt == null,
        )
      : undefined;
  const hasClientSource = Boolean(fromEvent) || activeClients.length > 0;
  const prefill = fromEvent
    ? {
        title: fromEvent.title ?? "",
        guestCount: Number(fromEvent.expectedHeadcount ?? 0),
        eventType: fromEvent.eventType ?? "",
        eventDate: dateInputFromEpoch(fromEvent.startsAt),
        venueName: fromEvent.venueName ?? "",
        venueAddress: fromEvent.venueAddress ?? "",
      }
    : null;

  useEffect(() => {
    // "Create proposal" on an event navigates here with ?event=<id>; open the
    // draft form prefilled from that event (spec §5.3 create-proposal-from-event).
    if (fromEvent) setShowDraft(true);
  }, [fromEvent?._id]);

  const activeRows = (proposals ?? []).filter((row) => row.deletedAt == null);
  // Keep accepted proposals visible — operators create the Event from them.
  const visibleRows = showTerminal
    ? activeRows
    : activeRows.filter(
        (row) => !["declined", "expired"].includes(String(row.status)),
      );

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

  const submitDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const clientId = String(data.get("clientId") || "").trim();
    const title = String(data.get("title") || "").trim();
    const subtotal = money(data.get("subtotal"));
    const taxAmount = money(data.get("taxAmount"));
    const discountAmount = money(data.get("discountAmount"));
    if (!clientId || !title) {
      setFailure(new Error("Client and title are required."));
      return;
    }
    if ([subtotal, taxAmount, discountAmount].some((n) => Number.isNaN(n))) {
      setFailure(new Error("Money fields must be valid numbers."));
      return;
    }
    const total = subtotal + taxAmount - discountAmount;
    if (total < 0) {
      setFailure(new Error("Total cannot be negative."));
      return;
    }
    void run("draft-proposal", async () => {
      await createProposal({
        clientId,
        title,
        subtotal,
        taxAmount,
        discountAmount,
        total,
        guestCount: Number(data.get("guestCount") || 0) || 0,
        eventDate: dateValue(data.get("eventDate")),
        eventType: String(data.get("eventType") || "").trim() || undefined,
        venueName: String(data.get("venueName") || "").trim() || undefined,
        venueAddress:
          String(data.get("venueAddress") || "").trim() || undefined,
        expiresAt: dateValue(data.get("expiresAt"), true),
        notes: String(data.get("notes") || "").trim() || undefined,
        terms: String(data.get("terms") || "").trim() || undefined,
        eventId: String(data.get("eventId") || "").trim() || undefined,
      });
      form.reset();
      draftForm.clear();
      setShowDraft(false);
      if (fromEventId) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("event");
        setSearchParams(nextParams, { replace: true });
      }
      setNotice(
        fromEventId
          ? "Proposal drafted and linked to the event. Send it when ready for the client."
          : "Proposal drafted. Send it when ready for the client.",
      );
    });
  };

  const invoke = (
    row: { _id: string; version: number; status: unknown; clientId?: unknown },
    key: string,
  ) => {
    void (async () => {
      if (key === "accept") {
        const linkableEvents = (events ?? []).filter(
          (event) =>
            event.deletedAt == null &&
            event.clientId === row.clientId &&
            LINKABLE_EVENT_STAGES.includes(String(event.stage)),
        );
        let eventId: string | undefined;
        if (linkableEvents.length > 0) {
          const values = await prompt.askFields({
            title: "Accept proposal",
            description:
              "Acceptance records the commercial win. Link an existing event to copy the client's menu selections onto it as dish lines.",
            fields: [
              {
                name: "eventId",
                label: "Link event (optional)",
                required: false,
                placeholder: "No event — link later",
                helper:
                  "Menu selections feed the linked event's dishes on accept.",
                options: linkableEvents.map((event) => ({
                  value: event._id,
                  label: String(event.title || event._id),
                })),
              },
            ],
            confirmLabel: "Accept proposal",
          });
          if (!values) return;
          eventId = values.eventId || undefined;
        } else {
          const ok = await prompt.askConfirm({
            title: "Accept proposal",
            description:
              "Acceptance records the commercial win. Create or link the Event from Events afterward — Manifest does not mint one from ProposalAccepted.",
            confirmLabel: "Accept proposal",
          });
          if (!ok) return;
        }
        void run(`${row._id}:accept`, async () => {
          await accept({ docId: row._id, version: row.version, eventId });
          setNotice(
            eventId
              ? "Proposal accepted. Menu selections were copied to the linked event's dishes."
              : "Proposal accepted. Use Create Event on the row to continue planning.",
          );
        });
        return;
      }
      if (key === "decline") {
        const ok = await prompt.askConfirm({
          title: "Decline proposal",
          description: "Marks this offer as declined.",
          confirmLabel: "Decline",
          tone: "danger",
        });
        if (!ok) return;
        void run(`${row._id}:decline`, async () => {
          await decline({ docId: row._id, version: row.version });
          setNotice("Proposal declined.");
        });
        return;
      }
      if (key === "requestSignature") {
        const client = clients?.find((c) => c._id === row.clientId);
        if (!client) {
          setFailure(new Error("Client not found"));
          return;
        }

        // Find or use latest revision
        const latestRevision = (proposalRevisions ?? [])
          .filter((r) => r.proposalId === row._id && r.deletedAt == null)
          .sort((a, b) => b.revisionNumber - a.revisionNumber)[0];

        const proposalRevisionId = latestRevision?._id;

        // If no revision exists, we'll create the signature request without one
        // (the SignatureRequest entity can work with a revision captured separately)

        const recipientName =
          client.clientType === "company"
            ? (client.companyName ?? "Unknown Company")
            : `${client.givenName ?? ""} ${client.familyName ?? ""}`.trim() ||
              "Unknown Client";

        const recipientEmail = client.email;
        if (!recipientEmail) {
          setFailure(
            new Error("Client email is required for signature request"),
          );
          return;
        }

        void run(`${row._id}:request-signature`, async () => {
          // Create signature request
          const result = await createSignatureRequest({
            proposalRevisionId: proposalRevisionId ?? "skip", // Skip if no revision yet
            recipientEmail,
            recipientName,
            recipientPersonId: "skip",
            recipientContactId: "skip",
            provider: "internal" as const,
            expiresAt: undefined,
            idempotencyKey: `signature-request-${row._id}-${Date.now()}`,
          });

          if (!result) {
            throw new Error("Failed to create signature request");
          }

          // Generate acceptance URL
          const callbackToken = result.docId; // The entity ID is the callback token
          const acceptanceUrl = `${window.location.origin}/accept/${callbackToken}`;

          // Copy to clipboard and show success
          await navigator.clipboard.writeText(acceptanceUrl);
          setNotice(
            `Signature request created. Acceptance URL copied to clipboard: ${acceptanceUrl}`,
          );
        });
        return;
      }
      void run(`${row._id}:${key}`, async () => {
        const args = { docId: row._id, version: row.version };
        if (key === "send") await send(args);
        if (key === "markViewed") await markViewed(args);
        if (key === "expire") await expire(args);
        setNotice(`Proposal updated (${key}).`);
      });
    })();
  };

  const loading = proposals === undefined || clients === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Clients · Proposals</p>
          <h1 className="display-title mt-2">Sales proposals</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Draft → send → accept/decline. Acceptance does not create an Event;
            finish planning in Events, then draft a Contract against that Event.
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setShowTerminal((value) => !value)}
          >
            {showTerminal ? "Hide declined/expired" : "Show declined/expired"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowDraft((value) => !value)}
          >
            {showDraft ? "Close form" : "Draft proposal"}
          </button>
        </div>
      </header>
      <ClientsWorkspaceNav />
      {failure ? <CrmFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-[13px] text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      {showDraft ? (
        <form
          className="supply-form"
          onSubmit={submitDraft}
          ref={draftForm.formRef}
        >
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Draft</p>
              <h2>{fromEvent ? "Proposal from event" : "New proposal"}</h2>
              {fromEvent ? (
                <p className="text-[13px] text-ink-2">
                  Linked to "{fromEvent.title}". Client is locked to that
                  event's client; the proposal belongs to this event (spec
                  §5.3).
                </p>
              ) : null}
            </div>
          </div>
          <DraftRestoreBanner
            draft={draftForm.draft}
            onRestore={draftForm.restore}
            onDiscard={draftForm.discard}
          />
          {!hasClientSource ? (
            <p className="text-[13px] text-ink-2">
              No active clients.{" "}
              <Link className="text-link" to={CLIENTS_ROUTES.root}>
                Register a client
              </Link>{" "}
              first.
            </p>
          ) : (
            <>
              {fromEvent ? (
                <label>
                  Client
                  <input
                    type="hidden"
                    name="clientId"
                    value={fromEvent.clientId}
                  />
                  <input type="hidden" name="eventId" value={fromEvent._id} />
                  <input
                    value={`${clientDisplayName(
                      fromEvent.clientId,
                      clients,
                    )} — from event "${fromEvent.title}"`}
                    disabled
                    readOnly
                  />
                </label>
              ) : (
                <label>
                  Client
                  <select name="clientId" required defaultValue="">
                    <option value="" disabled>
                      Select client
                    </option>
                    {activeClients.map((row) => (
                      <option key={row._id} value={row._id}>
                        {clientDisplayName(row._id, clients)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Title
                <input
                  name="title"
                  required
                  defaultValue={prefill?.title ?? ""}
                />
              </label>
              <label>
                Guest count
                <input
                  name="guestCount"
                  type="number"
                  min={0}
                  defaultValue={prefill?.guestCount ?? 0}
                />
              </label>
              <label>
                Event type
                <input
                  name="eventType"
                  defaultValue={prefill?.eventType ?? ""}
                />
              </label>
              <label>
                Event date
                <input
                  name="eventDate"
                  type="date"
                  defaultValue={prefill?.eventDate}
                />
              </label>
              <label>
                Venue name
                <input
                  name="venueName"
                  defaultValue={prefill?.venueName ?? ""}
                />
              </label>
              <label>
                Venue address
                <input
                  name="venueAddress"
                  defaultValue={prefill?.venueAddress ?? ""}
                />
              </label>
              <label>
                Subtotal
                <input
                  name="subtotal"
                  type="number"
                  step="0.01"
                  min={0}
                  required
                />
              </label>
              <label>
                Tax
                <input
                  name="taxAmount"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={0}
                  required
                />
              </label>
              <label>
                Discount
                <input
                  name="discountAmount"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={0}
                  required
                />
              </label>
              <label>
                Proposed menu
                <textarea
                  name="notes"
                  rows={4}
                  placeholder="List menu items, one per line"
                />
              </label>
              <label>
                Valid through
                <input
                  name="expiresAt"
                  type="date"
                  defaultValue={defaultValidityDate()}
                />
              </label>
              <label>
                Terms
                <textarea
                  name="terms"
                  rows={3}
                  placeholder="Deposit, service, cancellation, or other terms"
                />
              </label>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy === "draft-proposal"}
              >
                Draft proposal
              </button>
            </>
          )}
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Offers</p>
            <h2>Proposals</h2>
          </div>
          <span>{visibleRows.length}</span>
        </div>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : visibleRows.length === 0 ? (
          <div className="document-empty">
            <p>No open proposals.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Client</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <Fragment key={row._id}>
                  <tr>
                    <td>{row.title}</td>
                    <td>{clientDisplayName(row.clientId, clients)}</td>
                    <td>{Number(row.total ?? 0).toFixed(2)}</td>
                    <td>
                      <StatusChip status={String(row.status)} />
                    </td>
                    <td className="supply-row-actions">
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() =>
                          setMenuOpenFor((current) =>
                            current === row._id ? null : row._id,
                          )
                        }
                      >
                        {menuOpenFor === row._id ? "Hide menu" : "Menu"}
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        disabled={busy != null}
                        onClick={() => {
                          // Enrich proposal with timeline and venue logistics data
                          const event = events?.find(
                            (e) => e._id === row.eventId,
                          );
                          const eventTimelineItems =
                            event && timelineActivities
                              ? timelineActivities.filter(
                                  (a) =>
                                    a.eventId === event._id &&
                                    a.deletedAt == null,
                                )
                              : [];
                          const venue =
                            event?.venueId && venues
                              ? venues.find((v) => v._id === event.venueId)
                              : null;

                          const enrichedProposal: ProposalPdfRecord = {
                            ...row,
                            timelineItems:
                              transformTimelineActivities(eventTimelineItems),
                            venueLogistics: event
                              ? transformVenueLogistics(venue || null, event)
                              : undefined,
                          };

                          void downloadProposalPdf({
                            proposal: enrichedProposal,
                            clientName: clientDisplayName(
                              row.clientId,
                              clients,
                            ),
                            branding,
                          })
                            .then(() => setNotice("Proposal PDF downloaded."))
                            .catch((error) => setFailure(error));
                        }}
                      >
                        Download PDF
                      </button>
                      {(String(row.status) === "sent" ||
                        String(row.status) === "viewed") && (
                        <button
                          className="btn btn-ghost"
                          type="button"
                          disabled={busy != null}
                          onClick={() => invoke(row, "requestSignature")}
                        >
                          Request Signature
                        </button>
                      )}
                      {policy
                        .proposalActions(String(row.status))
                        .map((action) => (
                          <button
                            key={action.key}
                            className="btn btn-ghost"
                            type="button"
                            disabled={busy != null}
                            onClick={() => invoke(row, action.key)}
                          >
                            {action.label}
                          </button>
                        ))}
                      {String(row.status) === "accepted" ? (
                        <Link
                          className="btn btn-ghost"
                          to={eventCreatePath({
                            clientId: String(row.clientId),
                          })}
                        >
                          Create Event
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                  {menuOpenFor === row._id ? (
                    <tr>
                      <td colSpan={5}>
                        <ProposalMenuSelectionPanel
                          proposalId={row._id}
                          guestCount={Number(row.guestCount ?? 0)}
                          editable={MENU_EDITABLE_STATUSES.includes(
                            String(row.status),
                          )}
                          onFailure={setFailure}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
