import { Fragment, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useListClient,
  useListEvent,
  useListEventTimelineActivity,
  useListVenue,
  useListProposal,
  useListProposalLineItem,
  useListProposalEnhancement,
  useListProposalDishSelection,
  useListProposalRevision,
  useProposalAccept,
  useProposalDecline,
  useProposalExpire,
  useProposalMarkViewed,
  useCreateSignatureRequest,
  useListShareLink,
  useShareLinkCreate,
  useShareLinkRevoke,
} from "../../lib/manifest-convex-react";
import { api, type Id } from "../../lib/api";
import { useActionPrompt } from "../../ui/action-prompt";
import { EmptyState, StatusChip, TableSkeleton } from "../../ui/primitives";
import { formatMoneyExact } from "../../lib/format";
import { clientDisplayName } from "../events/clientName";
import { eventCreatePath } from "../events/eventRoutes";
import { useTenantBranding } from "../admin/tenantBranding";
import { ClientsWorkspaceNav } from "./ClientsWorkspaceNav";
import { CrmFailureBanner } from "./CrmFailureBanner";
import { CrmLifecyclePolicy } from "./CrmLifecyclePolicy";
import {
  downloadProposalPdf,
  transformTimelineActivities,
  transformVenueLogistics,
  type ProposalPdfRecord,
} from "./proposalPdf";
import { ProposalCreateForm } from "./ProposalCreateForm";
import { ProposalMenuSelectionPanel } from "./ProposalMenuSelectionPanel";
import { ProposalReadinessNotice } from "./ProposalReadinessNotice";
import { ProposalPricingPanel } from "./ProposalPricingPanel";
import { ProposalEnhancementsPanel } from "./ProposalEnhancementsPanel";
import { type PricingBasis } from "../../lib/pricing";

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
// The draft form (state, pricing preview, submit) lives in ProposalCreateForm.

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
  const proposalEnhancements = useListProposalEnhancement();
  const proposalDishSelections = useListProposalDishSelection();
  const proposalRevisions = useListProposalRevision();
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
  // Revocable proposal share links (spec §4.6). A link is pinned to the
  // proposal's latest captured revision; its Convex _id is the public token.
  const shareLinks = useListShareLink();
  const createShareLink = useShareLinkCreate();
  const revokeShareLink = useShareLinkRevoke();
  const [showDraft, setShowDraft] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const activeClients = (clients ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.registeredAt != null &&
      String(row.status) === "active",
  );
  // Newest captured revision for a proposal (the immutable revision a share link
  // pins to) and the proposal's active share link, if any (spec §4.6).
  const latestRevisionFor = (proposalId: string) =>
    (proposalRevisions ?? [])
      .filter((r) => r.proposalId === proposalId && r.deletedAt == null)
      .sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
  const activeShareLinkFor = (proposalId: string) =>
    (shareLinks ?? [])
      .filter(
        (l) =>
          l.proposalId === proposalId &&
          l.deletedAt == null &&
          String(l.status) === "active",
      )
      .sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0))[0];
  const copyShareUrl = async (id: string) => {
    const url = `${window.location.origin}/share/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Share link copied to clipboard.");
    } catch {
      setNotice(`Share link: ${url}`);
    }
  };
  const [searchParams] = useSearchParams();
  const fromEventId = searchParams.get("event");
  const fromEvent =
    fromEventId && events
      ? (events ?? []).find(
          (row) => row._id === fromEventId && row.deletedAt == null,
        )
      : undefined;

  const [pricingOpenFor, setPricingOpenFor] = useState<string | null>(null);
  const [enhancementsOpenFor, setEnhancementsOpenFor] = useState<string | null>(
    null,
  );

  useEffect(() => {
    // "Create proposal" on an event navigates here with ?event=<id>; open the
    // draft form prefilled from that event (spec §5.3 create-proposal-from-event).
    if (fromEvent) {
      setShowDraft(true);
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
              "Mark this proposal as accepted. The client's menu choices will copy over to the linked event.",
            confirmLabel: "Accept proposal",
          });
          if (!ok) return;
          void run(`${row._id}:accept`, async () => {
            await accept({ docId: row._id, version: row.version });
            setNotice(
              "Proposal accepted. The client's menu choices were copied to the linked event.",
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
              "Mark this proposal as accepted. Link an event and the client's menu choices carry over to it.",
            fields: [
              {
                name: "eventId",
                label: "Link event (optional)",
                required: false,
                placeholder: "No event — link later",
                helper:
                  "Menu choices copy to the linked event when you accept.",
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
              "Mark this proposal as accepted. You can create the event for it right after.",
            confirmLabel: "Accept proposal",
          });
          if (!ok) return;
        }
        void run(`${row._id}:accept`, async () => {
          await accept({ docId: row._id, version: row.version, eventId });
          setNotice(
            eventId
              ? "Proposal accepted. The client's menu choices were copied to the linked event."
              : "Proposal accepted. Use Create Event on the row to book it.",
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
      if (key === "shareLink") {
        // Spec §4.6: share/copy/replace. Reusing the active link copies it;
        // otherwise create one pinned to the latest published revision.
        const existing = activeShareLinkFor(row._id);
        if (existing) {
          void copyShareUrl(existing._id);
          return;
        }
        const revision = latestRevisionFor(row._id);
        if (!revision) {
          setFailure(
            new Error(
              "Send the proposal first — a share link needs a published revision.",
            ),
          );
          return;
        }
        void run(`${row._id}:share-link`, async () => {
          const result = (await createShareLink({
            proposalId: row._id,
            proposalRevisionId: revision._id,
            idempotencyKey: `share-link-${row._id}-${Date.now()}`,
          })) as { _id?: string; id?: string } | undefined;
          const id = result?._id ?? result?.id;
          if (!id) throw new Error("Failed to create share link");
          await copyShareUrl(id);
        });
        return;
      }
      if (key === "revokeShareLink") {
        const existing = activeShareLinkFor(row._id);
        if (!existing) return;
        const ok = await prompt.askConfirm({
          title: "Revoke share link",
          description:
            "The client will no longer be able to open this link. You can create a new one anytime.",
          confirmLabel: "Revoke link",
          tone: "danger",
        });
        if (!ok) return;
        void run(`${row._id}:revoke-share`, async () => {
          await revokeShareLink({
            docId: existing._id,
            version: existing.version,
          });
          setNotice("Share link revoked.");
        });
        return;
      }
      if (key === "requestSignature") {
        const client = clients?.find((c) => c._id === row.clientId);
        if (!client) {
          setFailure(new Error("Client not found"));
          return;
        }

        if (proposalRevisions === undefined) {
          setFailure(
            new Error("Still loading revisions — try again in a second."),
          );
          return;
        }

        // Find or use latest revision
        const latestRevision = proposalRevisions
          .filter((r) => r.proposalId === row._id && r.deletedAt == null)
          .sort((a, b) => b.revisionNumber - a.revisionNumber)[0];

        const proposalRevisionId = latestRevision?._id;
        // Sending a proposal captures a revision, and this action only shows
        // for sent/viewed proposals — a missing revision means the send-time
        // capture failed and the request would dangle. Fail loud instead.
        if (!proposalRevisionId) {
          setFailure(
            new Error(
              "This proposal has no revision snapshot (sent before snapshots existed). Create a share link or accept it manually; signature requests need a snapshot.",
            ),
          );
          return;
        }

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
          // Optional recipient links are omitted, not sent as "skip" — the
          // schema validates them (uuid) and the value would be stored as a FK.
          const result = await createSignatureRequest({
            proposalRevisionId,
            // proposalId drives the SignatureCompleted → Proposal.accept
            // cascade, so the signed proposal actually flips to "accepted".
            proposalId: row._id,
            recipientEmail,
            recipientName,
            provider: "internal" as const,
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
        setNotice(
          key === "send"
            ? "Proposal sent."
            : key === "markViewed"
              ? "Proposal marked as viewed."
              : key === "expire"
                ? "Proposal marked as expired."
                : "Proposal updated.",
        );
      });
    })();
  };

  const loading = proposals === undefined || clients === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Clients · Proposals</p>
          <h1 className="display-title mt-2">Proposals</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Priced offers your clients can accept with one click. When a
            proposal is accepted, turn it into a booked event.
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
            {showDraft ? "Close form" : "New proposal"}
          </button>
        </div>
      </header>
      <ClientsWorkspaceNav />
      {failure ? <CrmFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      <ProposalCreateForm
        open={showDraft}
        fromEvent={fromEvent}
        clients={clients}
        activeClients={activeClients}
        busy={busy}
        run={run}
        onFailure={setFailure}
        onNotice={setNotice}
        onClose={() => setShowDraft(false)}
      />

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
          <EmptyState
            title="No open proposals."
            hint="Draft an offer to start the sales conversation."
            action={
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setShowDraft(true)}
              >
                New proposal
              </button>
            }
          />
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
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
                      <td className="supply-number">
                        {formatMoneyExact(Number(row.total ?? 0))}
                      </td>
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
                          onClick={() =>
                            setEnhancementsOpenFor((current) =>
                              current === row._id ? null : row._id,
                            )
                          }
                        >
                          {enhancementsOpenFor === row._id
                            ? "Hide enhancements"
                            : "Enhancements"}
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
                                  pricingBasis:
                                    line.pricingBasis as PricingBasis,
                                  unitPrice: Number(line.unitPrice) || 0,
                                  quantity: line.quantity,
                                  unit: line.unit,
                                })),
                              enhancements: (proposalEnhancements ?? [])
                                .filter(
                                  (item) =>
                                    item.proposalId === row._id &&
                                    item.deletedAt == null &&
                                    item.addedAt != null,
                                )
                                .sort(
                                  (a, b) =>
                                    Number(a.sortOrder) - Number(b.sortOrder),
                                )
                                .map((item) => ({
                                  name: item.name,
                                  description: item.description ?? undefined,
                                  price: Number(item.price) || 0,
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
                            Request signature
                          </button>
                        )}
                        {(String(row.status) === "sent" ||
                          String(row.status) === "viewed" ||
                          String(row.status) === "accepted") && (
                          <>
                            <button
                              className="btn btn-ghost"
                              type="button"
                              disabled={busy != null}
                              onClick={() => invoke(row, "shareLink")}
                            >
                              {activeShareLinkFor(row._id)
                                ? "Copy link"
                                : "Share link"}
                            </button>
                            {activeShareLinkFor(row._id) && (
                              <button
                                className="btn btn-ghost"
                                type="button"
                                disabled={busy != null}
                                onClick={() => invoke(row, "revokeShareLink")}
                              >
                                Revoke link
                              </button>
                            )}
                          </>
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
                    <tr>
                      <td colSpan={5} className="pt-0">
                        <ProposalReadinessNotice
                          eventId={row.eventId ? String(row.eventId) : null}
                          status={String(row.status)}
                          hasVenue={Boolean(
                            events?.find((e) => e._id === row.eventId)?.venueId,
                          )}
                          hasMenuSelections={(
                            proposalDishSelections ?? []
                          ).some(
                            (selection) =>
                              selection.proposalId === row._id &&
                              selection.deletedAt == null,
                          )}
                          hasPricedLines={(proposalLineItems ?? []).some(
                            (line) =>
                              line.proposalId === row._id &&
                              line.deletedAt == null,
                          )}
                        />
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
                    {enhancementsOpenFor === row._id ? (
                      <tr>
                        <td colSpan={5}>
                          <ProposalEnhancementsPanel
                            proposalId={row._id}
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
          </div>
        )}
      </section>
    </div>
  );
}
