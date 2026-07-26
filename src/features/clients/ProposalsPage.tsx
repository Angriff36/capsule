import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useMutation } from "convex/react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useListClient,
  useListEvent,
  useListEventTimelineActivity,
  useListVenue,
  useListProposal,
  useListProposalLineItem,
  useListProposalRevision,
  useProposalAccept,
  useProposalDecline,
  useProposalExpire,
  useProposalMarkViewed,
  useCreateSignatureRequest,
} from "../../lib/manifest-convex-react";
import { api, type Id } from "../../lib/api";
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
import { ProposalPricingPanel } from "./ProposalPricingPanel";
import {
  computeProposalPricing,
  PRICING_BASES,
  PRICING_BASIS_LABELS,
  type PricingBasis,
} from "../../lib/pricing";

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

// Proposal money math lives in the shared pricing engine (src/lib/pricing.ts).

// In-memory pricing line in the draft form (spec §5.4). Numeric inputs are kept
// as strings for clean editing; parsed for the central calc on submit/preview.
type DraftLine = {
  key: string;
  description: string;
  pricingBasis: PricingBasis;
  unitPrice: string;
  quantity: string;
  unit: string;
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
  // Tenant-wide priced lines; filtered per proposal for the PDF breakdown and
  // the pricing panel. Same query ProposalPricingPanel subscribes to (cached).
  const proposalLineItems = useListProposalLineItem();
  const proposalRevisions = useListProposalRevision();
  const draftProposalWithLines = useMutation(
    api.lib.proposalDraft.draftProposalWithLines,
  );
  // Send captures a revision snapshot server-side (spec §5.5 / Priority 10) —
  // a thin authored action wraps the generated Proposal_send + best-effort
  // capture, so a sent proposal always has a reproducible revision record.
  const send = useMutation(
    api.lib.proposalRevision.sendProposalWithRevisionCapture,
  );
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

  const [pricingOpenFor, setPricingOpenFor] = useState<string | null>(null);
  const lineSeqRef = useRef(0);
  const newDraftLine = (): DraftLine => ({
    key: `line-${lineSeqRef.current++}`,
    description: "",
    pricingBasis: "flat",
    unitPrice: "",
    quantity: "1",
    unit: "",
  });
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [draftGuestCount, setDraftGuestCount] = useState<number>(0);
  const [draftTax, setDraftTax] = useState<number>(0);
  const [draftDiscount, setDraftDiscount] = useState<number>(0);

  // Live pricing preview via the ONE central calc (spec §5.4): lines → totals.
  const draftPricing = useMemo(
    () =>
      computeProposalPricing({
        lines: draftLines.map((l) => ({
          pricingBasis: l.pricingBasis,
          unitPrice: Number(l.unitPrice) || 0,
          quantity: Number(l.quantity) || 0,
        })),
        guestCount: draftGuestCount,
        discountAmount: draftDiscount,
        taxAmount: draftTax,
      }),
    [draftLines, draftGuestCount, draftTax, draftDiscount],
  );

  const updateLine = (key: string, field: keyof DraftLine, value: string) =>
    setDraftLines((lines) =>
      lines.map((l) =>
        l.key === key ? ({ ...l, [field]: value } as DraftLine) : l,
      ),
    );
  const removeLine = (key: string) =>
    setDraftLines((lines) => lines.filter((l) => l.key !== key));
  const addLine = () => setDraftLines((lines) => [...lines, newDraftLine()]);

  useEffect(() => {
    // "Create proposal" on an event navigates here with ?event=<id>; open the
    // draft form prefilled from that event (spec §5.3 create-proposal-from-event).
    if (fromEvent) {
      setShowDraft(true);
      setDraftGuestCount(Number(fromEvent.expectedHeadcount ?? 0));
    }
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
    if (!clientId || !title) {
      setFailure(new Error("Client and title are required."));
      return;
    }
    // Central calc (spec §5.4) derives the four stored totals from the priced
    // lines. A row with a price/quantity but no description would otherwise be
    // silently dropped here while the live preview counted it — validate instead
    // so preview and submit agree.
    const populatedLines = draftLines.filter(
      (line) =>
        line.description.trim().length > 0 ||
        line.unitPrice.trim().length > 0 ||
        line.quantity.trim().length > 0,
    );
    const lineMissingDescription = populatedLines.find(
      (line) => line.description.trim().length === 0,
    );
    if (lineMissingDescription) {
      setFailure(new Error("Every pricing line needs a description."));
      return;
    }
    const validLines = populatedLines;
    const pricing = computeProposalPricing({
      lines: validLines.map((line) => ({
        pricingBasis: line.pricingBasis,
        unitPrice: Number(line.unitPrice) || 0,
        quantity: Number(line.quantity) || 0,
      })),
      guestCount: draftGuestCount,
      discountAmount: draftDiscount,
      taxAmount: draftTax,
    });
    if (pricing.total < 0) {
      setFailure(new Error("Total cannot be negative."));
      return;
    }
    void run("draft-proposal", async () => {
      const eventIdRaw = String(data.get("eventId") || "").trim();
      // Create the proposal AND all its priced lines in one atomic server
      // transaction (convex/lib/proposalPricing.ts draftProposalWithLines): the
      // central calc derives authoritative totals + every line amount there, so
      // an interruption can never leave stored totals for lines not persisted.
      await draftProposalWithLines({
        clientId: clientId as Id<"clients">,
        title,
        guestCount: draftGuestCount,
        subtotal: pricing.subtotal,
        taxAmount: pricing.taxAmount,
        discountAmount: pricing.discountAmount,
        total: pricing.total,
        eventDate: dateValue(data.get("eventDate")),
        eventType: String(data.get("eventType") || "").trim() || undefined,
        venueName: String(data.get("venueName") || "").trim() || undefined,
        venueAddress:
          String(data.get("venueAddress") || "").trim() || undefined,
        expiresAt: dateValue(data.get("expiresAt"), true),
        notes: String(data.get("notes") || "").trim() || undefined,
        terms: String(data.get("terms") || "").trim() || undefined,
        eventId: eventIdRaw ? (eventIdRaw as Id<"events">) : undefined,
        lines: validLines.map((line, i) => ({
          description: line.description.trim(),
          pricingBasis: pricing.lines[i].pricingBasis,
          unitPrice: pricing.lines[i].unitPrice,
          quantity: pricing.lines[i].quantity ?? undefined,
          unit: line.unit.trim() || undefined,
        })),
      });
      form.reset();
      draftForm.clear();
      setDraftLines([]);
      setDraftTax(0);
      setDraftDiscount(0);
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
    row: {
      _id: string;
      version: number;
      status: unknown;
      clientId?: unknown;
      eventId?: unknown;
    },
    key: string,
  ) => {
    void (async () => {
      if (key === "accept") {
        // Already linked to an event (e.g., created from an event per §5.3):
        // accept preserves the link and runs the menu cascade against it
        // server-side, so do not re-prompt to "link an event" or claim it is
        // unlinked (the prior copy misled on this happy path).
        if (row.eventId) {
          const ok = await prompt.askConfirm({
            title: "Accept proposal",
            description:
              "Acceptance records the commercial win. Menu selections will copy to the linked event's dishes.",
            confirmLabel: "Accept proposal",
          });
          if (!ok) return;
          void run(`${row._id}:accept`, async () => {
            await accept({ docId: row._id, version: row.version });
            setNotice(
              "Proposal accepted. Menu selections were copied to the linked event's dishes.",
            );
          });
          return;
        }
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
        if (key === "send")
          await send({
            docId: row._id as Id<"proposals">,
            version: row.version,
          });
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
          key={fromEvent?._id ?? "new-proposal"}
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
                  value={draftGuestCount}
                  onChange={(e) =>
                    setDraftGuestCount(Number(e.target.value) || 0)
                  }
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
              <div className="mt-1">
                <p className="eyebrow">Pricing lines (spec §5.4)</p>
                <p className="text-[12px] text-ink-2">
                  Per person / per unit / flat / percentage / package. Subtotal
                  and total are computed by the shared pricing engine.
                </p>
                {draftLines.length === 0 ? (
                  <p className="mt-2 text-[13px] text-ink-2">
                    No pricing lines yet — add one to price the proposal.
                  </p>
                ) : (
                  <table className="data-table mt-2">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Basis</th>
                        <th>Price / %</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th>Amount</th>
                        <th aria-label="Remove line" />
                      </tr>
                    </thead>
                    <tbody>
                      {draftLines.map((line, index) => (
                        <tr key={line.key}>
                          <td>
                            <input
                              className="input"
                              value={line.description}
                              onChange={(e) =>
                                updateLine(
                                  line.key,
                                  "description",
                                  e.target.value,
                                )
                              }
                              placeholder="Line description"
                            />
                          </td>
                          <td>
                            <select
                              className="input"
                              value={line.pricingBasis}
                              onChange={(e) =>
                                updateLine(
                                  line.key,
                                  "pricingBasis",
                                  e.target.value,
                                )
                              }
                            >
                              {PRICING_BASES.map((basis) => (
                                <option key={basis} value={basis}>
                                  {PRICING_BASIS_LABELS[basis]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className="input w-24"
                              type="number"
                              step="0.01"
                              min={0}
                              value={line.unitPrice}
                              onChange={(e) =>
                                updateLine(
                                  line.key,
                                  "unitPrice",
                                  e.target.value,
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="input w-20"
                              type="number"
                              step="0.01"
                              min={0}
                              value={line.quantity}
                              onChange={(e) =>
                                updateLine(line.key, "quantity", e.target.value)
                              }
                              disabled={line.pricingBasis !== "per_unit"}
                            />
                          </td>
                          <td>
                            <input
                              className="input w-20"
                              value={line.unit}
                              onChange={(e) =>
                                updateLine(line.key, "unit", e.target.value)
                              }
                              placeholder="tray, hr"
                              disabled={line.pricingBasis !== "per_unit"}
                            />
                          </td>
                          <td className="tabular-nums">
                            {(draftPricing.lines[index]?.amount ?? 0).toFixed(
                              2,
                            )}
                          </td>
                          <td>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => removeLine(line.key)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <button
                  className="btn btn-ghost btn-sm mt-2"
                  type="button"
                  onClick={addLine}
                >
                  Add line
                </button>
                <p className="mt-2 text-[13px] text-ink-2">
                  Subtotal (from lines):{" "}
                  <span className="tabular-nums">
                    {draftPricing.subtotal.toFixed(2)}
                  </span>
                </p>
              </div>
              <label>
                Tax
                <input
                  name="taxAmount"
                  type="number"
                  step="0.01"
                  min={0}
                  value={draftTax}
                  onChange={(e) => setDraftTax(Number(e.target.value) || 0)}
                />
              </label>
              <label>
                Discount
                <input
                  name="discountAmount"
                  type="number"
                  step="0.01"
                  min={0}
                  value={draftDiscount}
                  onChange={(e) =>
                    setDraftDiscount(Number(e.target.value) || 0)
                  }
                />
              </label>
              <p className="text-[13px] font-semibold text-ink">
                Total:{" "}
                <span className="tabular-nums">
                  {draftPricing.total.toFixed(2)}
                </span>
              </p>
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
                        onClick={() =>
                          setPricingOpenFor((current) =>
                            current === row._id ? null : row._id,
                          )
                        }
                      >
                        {pricingOpenFor === row._id
                          ? "Hide pricing"
                          : "Pricing"}
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
                            pricingLines: (proposalLineItems ?? [])
                              .filter(
                                (line) =>
                                  line.proposalId === row._id &&
                                  line.deletedAt == null,
                              )
                              .sort(
                                (a, b) =>
                                  Number(a.sortOrder) - Number(b.sortOrder),
                              )
                              .map((line) => ({
                                description: line.description,
                                pricingBasis: line.pricingBasis as PricingBasis,
                                unitPrice: Number(line.unitPrice) || 0,
                                quantity: line.quantity,
                                unit: line.unit,
                              })),
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
                  {pricingOpenFor === row._id ? (
                    <tr>
                      <td colSpan={5}>
                        <ProposalPricingPanel
                          proposalId={row._id}
                          guestCount={Number(row.guestCount ?? 0)}
                          taxAmount={Number(row.taxAmount ?? 0)}
                          discountAmount={Number(row.discountAmount ?? 0)}
                          editable={String(row.status) === "draft"}
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
