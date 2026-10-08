import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useGetEvent,
  useGetProposal,
  useListVenue,
  useProposalAccept,
  useProposalDecline,
  useProposalExpire,
  useProposalMarkViewed,
  useCreateSignatureRequest,
  useShareLinkCreate,
  useShareLinkRevoke,
} from "../../lib/manifest-convex-react";
import { useWholeDishList } from "../../lib/useDishesByIds";
import { useProposalPictureUrls } from "../../lib/useProposalPictureUrls";
import {
  useClientDirectory,
  useReadClient,
} from "../../lib/useClientDirectory";
import { type Id } from "../../lib/api";
import {
  useEventTimelineActivities,
  usePagedRows,
  useProposalDishSelections,
  useProposalEnhancements,
  useProposalLineItems,
  useProposalRevisions,
  useProposalShareLinks,
  useReadClientEvents,
} from "../../lib/financeScopedQueries";
import { useRouteRecord } from "../../lib/routeRecord";
import { useActionPrompt } from "../../ui/action-prompt";
import { EmptyState, StatusChip, TableSkeleton } from "../../ui/primitives";
import { formatDate, formatMoneyExact, formatTime } from "../../lib/format";
import { useEmailProposal } from "../../lib/proposalEmailActions";
import { ProposalEmailHistory } from "./ProposalEmailHistory";
import { clientDisplayName } from "../events/clientName";
import { useEventRecordsById } from "../facilities/useEventsById";
import { eventCreatePath, eventDetailPath } from "../events/eventRoutes";
import { useTenantBranding } from "../admin/tenantBranding";
import { ClientsWorkspaceNav } from "./ClientsWorkspaceNav";
import { CrmFailureBanner } from "./CrmFailureBanner";
import { CrmLifecyclePolicy } from "./CrmLifecyclePolicy";
import {
  downloadProposalPdf,
  proposalPdfBase64,
  transformTimelineActivities,
  transformVenueLogistics,
  type ProposalPdfRecord,
} from "./proposalPdf";
import { ProposalSignatureRevokeAction } from "../sales/ProposalSignatureRevokeAction";
import { ProposalChangeAction } from "./ProposalChangeAction";
import { ProposalChangeLabel } from "./ProposalChangeLabel";
import {
  HistoricalAcceptanceLabel,
  RecordAcceptedBeforeCapsule,
} from "./ProposalHistoricalAcceptance";
import { ProposalCreateForm } from "./ProposalCreateForm";
import { ProposalMenuSelectionPanel } from "./ProposalMenuSelectionPanel";
import { ProposalTermsPanel } from "./ProposalTermsPanel";
import { ProposalPaymentSchedulePanel } from "./ProposalPaymentSchedulePanel";
import { proposalPaymentSchedule } from "../../lib/proposalPaymentSchedule";
import { ProposalReadinessNotice } from "./ProposalReadinessNotice";
import {
  ProposalDraftCheck,
  useGenerateProposalDraft,
} from "./ProposalDraftCheck";
import { generateAcceptanceUrl } from "./proposalSignatureRequest";
import "./ProposalsPage.css";
import { useSendProposalWithRevisionCapture } from "./useSendProposalWithRevisionCapture";
import { ProposalPricingPanel } from "./ProposalPricingPanel";
import { ProposalEnhancementsPanel } from "./ProposalEnhancementsPanel";
import { type PricingBasis } from "../../lib/pricing";
import { useActionNotice } from "../../ui/action-result";
import { LifecycleStepper } from "../../ui/LifecycleStepper";
import { proposalLifecycle } from "../../lib/lifecycle/lifecycleDefinitions";
import {
  projectProposalPdf,
  downloadProjectedProposalPdf,
} from "./proposalPdfProjection";

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
  const withPictureUrls = useProposalPictureUrls();
  // The newest proposals, a page at a time ("Load more" reads older ones).
  const proposalPages = usePagedRows("proposals");
  const proposals = proposalPages.rows;
  // Names only; the signature request reads the one client's email.
  const clients = useClientDirectory();
  const readClient = useReadClient();
  const readClientEvents = useReadClientEvents();
  // The events the listed proposals are linked to, and nothing else.
  const linkedEventIds = useMemo(
    () =>
      proposals === undefined
        ? undefined
        : [
            ...new Set(
              proposals
                .map((p) => (p.eventId ? String(p.eventId) : ""))
                .filter(Boolean),
            ),
          ],
    [proposals],
  );
  const events = useEventRecordsById(linkedEventIds);
  const venues = useListVenue();
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  // An open row's lines, choices, versions, links and event timeline; the
  // list itself shows only what is on each proposal.
  const proposalLineItems = useProposalLineItems(openRowId);
  const proposalEnhancements = useProposalEnhancements(openRowId);
  const proposalDishSelections = useProposalDishSelections(openRowId);
  const proposalRevisions = useProposalRevisions(openRowId);
  const openEventId = proposals?.find((row) => row._id === openRowId)?.eventId;
  const timelineActivities = useEventTimelineActivities(
    openEventId ? String(openEventId) : null,
  );
  const dishes = useWholeDishList();
  // Send captures a revision snapshot server-side (spec §5.5 / Priority 10) —
  // a thin authored action wraps the generated Proposal_send + best-effort
  // capture, so a sent proposal always has a reproducible revision record.
  const send = useSendProposalWithRevisionCapture();
  const markViewed = useProposalMarkViewed();
  const accept = useProposalAccept();
  const decline = useProposalDecline();
  const expire = useProposalExpire();
  const createSignatureRequest = useCreateSignatureRequest();
  // Revocable proposal share links (spec §4.6). A link is pinned to the
  // proposal's latest captured revision; its Convex _id is the public token.
  const shareLinks = useProposalShareLinks(openRowId);
  const createShareLink = useShareLinkCreate();
  const revokeShareLink = useShareLinkRevoke();
  const emailProposal = useEmailProposal();
  const [showDraft, setShowDraft] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [find, setFind] = useState("");
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();
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
  // The link shows at once; the clipboard is a bonus. A clipboard that never
  // answers (window in the background) must not keep the page busy.
  const copyShareUrl = (id: string) => {
    const url = `${window.location.origin}/share/${id}`;
    setNotice(`Share link: ${url}`);
    navigator.clipboard
      ?.writeText(url)
      .then(() => setNotice(`Share link copied to clipboard: ${url}`))
      .catch(() => undefined);
  };
  const [searchParams, setSearchParams] = useSearchParams();
  // One button builds the draft from the event, or brings the draft it built
  // before up to date (convex/lib/proposalGenerate.ts); staff edits are kept.
  const generateDraft = useGenerateProposalDraft();
  const buildFromEvent = async (eventId: Id<"events">) => {
    setBusy("build-from-event");
    setFailure(null);
    try {
      const result = await generateDraft({ eventId });
      setShowDraft(false);
      setNotice(
        result.created
          ? "Proposal built from the event. Check it, then send it."
          : result.changed
            ? "Proposal brought up to date with the event. Staff changes were kept."
            : "This event's proposal already matches the event.",
      );
      setSearchParams({ proposal: result.proposalId });
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };
  const fromEventId = searchParams.get("event");
  // The event a "build from event" link names, read on its own.
  const singleFromEvent = useGetEvent(fromEventId ? fromEventId : "skip");
  const fromEvent =
    singleFromEvent && singleFromEvent.deletedAt == null
      ? singleFromEvent
      : undefined;

  const [pricingOpenFor, setPricingOpenFor] = useState<string | null>(null);
  const [enhancementsOpenFor, setEnhancementsOpenFor] = useState<string | null>(
    null,
  );
  const [emailsOpenFor, setEmailsOpenFor] = useState<string | null>(null);
  const [emailsKey, setEmailsKey] = useState(0);

  // Row deep link: /clients/proposals?proposal=<id> opens that proposal's
  // detail panels (menu, pricing, enhancements) and scrolls the row into view,
  // so each proposal has a shareable URL without a separate detail page.
  const focusedProposalId = searchParams.get("proposal");
  // A linked proposal older than the loaded pages is read on its own.
  const focusedProposal = useRouteRecord(
    useGetProposal,
    focusedProposalId &&
      proposals !== undefined &&
      !proposals.some((row) => row._id === focusedProposalId)
      ? focusedProposalId
      : undefined,
  );
  const proposalsLoaded = proposals !== undefined;
  useEffect(() => {
    if (!focusedProposalId || !proposalsLoaded) return;
    setOpenRowId(focusedProposalId);
    setMenuOpenFor(focusedProposalId);
    setPricingOpenFor(focusedProposalId);
    setEnhancementsOpenFor(focusedProposalId);
    document
      .getElementById(`proposal-${focusedProposalId}`)
      ?.scrollIntoView({ block: "start" });
  }, [focusedProposalId, proposalsLoaded]);

  // "Create proposal" on an event navigates here with ?event=<id>: one click
  // builds the proposal from the event (menu, prices, date, venue) and opens
  // it (issue #415). Building again is safe: an unchanged event writes
  // nothing. Only an event with no client yet falls back to the form.
  const builtFor = useRef<string | null>(null);
  useEffect(() => {
    if (!fromEvent || builtFor.current === fromEvent._id) return;
    builtFor.current = fromEvent._id;
    if (fromEvent.clientId) {
      void buildFromEvent(fromEvent._id as Id<"events">);
    } else {
      setShowDraft(true);
    }
  }, [fromEvent?._id]);

  const activeRows = [
    ...(proposals ?? []),
    ...(focusedProposal ? [focusedProposal] : []),
  ].filter((row) => row.deletedAt == null);
  // Keep accepted proposals visible — operators create the Event from them.
  const openRows = showTerminal
    ? activeRows
    : activeRows.filter(
        (row) => !["declined", "expired"].includes(String(row.status)),
      );
  // Find by title or client; a proposal opened by link always stays listed.
  const needle = find.trim().toLowerCase();
  const visibleRows = needle
    ? openRows.filter(
        (row) =>
          row._id === focusedProposalId ||
          [row.title, clientDisplayName(row.clientId, clients)].some((value) =>
            String(value ?? "")
              .toLowerCase()
              .includes(needle),
          ),
      )
    : openRows;

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
      total?: unknown;
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
        // Only this client's events, read when accepting.
        const clientEvents = row.clientId
          ? await readClientEvents(String(row.clientId))
          : [];
        const linkableEvents = clientEvents.filter(
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
              : "Proposal accepted. Use Create Event on the row to book it — the details and menu carry over.",
          );
        });
        return;
      }
      if (key === "decline") {
        const values = await prompt.askFields({
          title: "Decline proposal",
          description: "Marks this offer as declined.",
          confirmLabel: "Decline",
          tone: "danger",
          fields: [
            {
              name: "reason",
              label: "Why did they say no? (optional)",
              inputType: "text",
              required: false,
            },
          ],
        });
        if (!values) return;
        void run(`${row._id}:decline`, async () => {
          await decline({
            docId: row._id,
            version: row.version,
            reason: values.reason?.trim() || undefined,
          });
          setNotice("Proposal declined.");
        });
        return;
      }
      if (key === "shareLink") {
        // Spec §4.6: share/copy/replace. Reusing the active link copies it;
        // otherwise create one pinned to the latest published revision.
        const existing = activeShareLinkFor(row._id);
        if (existing) {
          copyShareUrl(existing._id);
          return;
        }
        const revision = latestRevisionFor(row._id);
        if (!revision) {
          setFailure(
            new Error("Send the proposal first, then make its share link."),
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
          copyShareUrl(id);
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
        const client = row.clientId
          ? await readClient(String(row.clientId)).catch(() => null)
          : null;
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
              "This proposal was sent before Capsule kept a copy of each sent version, so it cannot ask for a signature. Send it again to ask for one, or mark it accepted by hand.",
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
            new Error(
              "Give this client an email address before you request a signature.",
            ),
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
          const acceptanceUrl = generateAcceptanceUrl(callbackToken);

          // The request exists now. The link shows at once; a clipboard
          // that fails or never answers must not hide it or keep the page busy.
          setNotice(
            `Signature request created. Copy the acceptance link: ${acceptanceUrl}`,
          );
          void Promise.resolve()
            .then(() => navigator.clipboard.writeText(acceptanceUrl))
            .then(
              () =>
                setNotice(
                  `Signature request created. Acceptance URL copied to clipboard: ${acceptanceUrl}`,
                ),
              () => undefined,
            );
        });
        return;
      }
      // A proposal with no price usually went out by mistake.
      if (
        key === "send" &&
        Number(row.total ?? 0) === 0 &&
        !(await prompt.askConfirm({
          title: "Send without a price?",
          description:
            "This proposal has no price yet, so the client sees $0. Add pricing first, or send it as a menu-only proposal.",
          confirmLabel: "Send anyway",
          cancelLabel: "Add pricing first",
        }))
      )
        return;
      // Expired is final (no way back), so it asks once.
      if (
        key === "expire" &&
        !(await prompt.askConfirm({
          title: "Expire proposal",
          description:
            "The client can no longer accept it. To offer it again, make a new proposal.",
          confirmLabel: "Expire proposal",
          cancelLabel: "Keep it open",
        }))
      )
        return;
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
            ? "Proposal published. Press Email the proposal to send the client the PDF, or copy its share link."
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

  // The PDF a row's Download PDF saves: a sent proposal's published
  // version, a draft's current data. Email the proposal sends the same file.
  const pdfProjectionFor = (row: (typeof visibleRows)[number]) => {
    if (String(row.status) !== "draft" && proposalRevisions === undefined)
      return null;
    if (
      String(row.status) === "draft" &&
      (proposalDishSelections === undefined || dishes === undefined)
    )
      return null;
    // Enrich proposal with timeline and venue logistics data
    const event = events?.find((e) => e._id === row.eventId);
    const eventTimelineItems =
      event && timelineActivities
        ? timelineActivities.filter(
            (a) => a.eventId === event._id && a.deletedAt == null,
          )
        : [];
    const venue =
      event?.venueId && venues
        ? venues.find((v) => v._id === event.venueId)
        : null;

    const enrichedProposal: ProposalPdfRecord = {
      ...row,
      visibleSections: (row.visibleSections ?? []).filter(
        (section): section is string => typeof section === "string",
      ),
      sectionOrder: (row.sectionOrder ?? []).filter(
        (section): section is string => typeof section === "string",
      ),
      paymentSchedule: proposalPaymentSchedule({
        total: Number(row.total) || 0,
        depositPercent: row.depositPercent,
        balanceDueDaysBefore: row.balanceDueDaysBefore,
        eventDate: row.eventDate,
      }),
      timelineItems: transformTimelineActivities(eventTimelineItems),
      venueLogistics: event
        ? transformVenueLogistics(venue || null, event)
        : undefined,
      dishSelections: (proposalDishSelections ?? [])
        .filter(
          (selection) =>
            selection.proposalId === row._id && selection.deletedAt == null,
        )
        .flatMap((selection) => {
          const dish = dishes?.find(
            (candidate) => candidate._id === selection.dishId,
          );
          return dish
            ? [
                {
                  dishName: dish.name,
                  dishDescription: dish.description ?? null,
                },
              ]
            : [];
        }),
      pricingLines: (proposalLineItems ?? [])
        .filter((line) => line.proposalId === row._id && line.deletedAt == null)
        .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
        .map((line) => ({
          description: line.description,
          pricingBasis: line.pricingBasis as PricingBasis,
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
        .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
        .map((item) => ({
          name: item.name,
          description: item.description ?? undefined,
          price: Number(item.price) || 0,
        })),
    };
    const pdfClientName = clientDisplayName(row.clientId, clients);

    const publishedRevision = latestRevisionFor(row._id);
    const pdfProjection =
      String(row.status) === "draft"
        ? {
            proposal: enrichedProposal,
            clientName: pdfClientName,
            source: null,
          }
        : projectProposalPdf(
            enrichedProposal,
            pdfClientName,
            publishedRevision,
          );

    return pdfProjection;
  };

  // Emails the published version's PDF (the Download PDF file) to the client.
  const onEmailProposal = (row: (typeof visibleRows)[number]) => {
    const projection = pdfProjectionFor(row);
    const revision = latestRevisionFor(row._id);
    if (!projection || !revision) return;
    if (projection.source !== "revision") {
      setFailure(
        new Error(
          "This proposal's published version could not be read, so Capsule will not email it. Send the proposal again from a draft.",
        ),
      );
      return;
    }
    void run(`${row._id}:email`, async () => {
      const pdf = await proposalPdfBase64({
        proposal: await withPictureUrls(projection.proposal),
        clientName: projection.clientName,
        branding,
      });
      const result = await emailProposal({
        proposalId: row._id,
        revisionId: revision._id,
        pdfBase64: pdf.base64,
        fileName: pdf.fileName,
      }).finally(() => {
        // Sent or not, the row's email list opens with the newest try.
        setEmailsOpenFor(row._id);
        setEmailsKey((key) => key + 1);
      });
      if (result.status === "already_sent") {
        setNotice(
          `Not sent again — this version already went${
            result.to ? ` to ${result.to}` : ""
          }${
            result.sentAt != null
              ? ` at ${formatTime(result.sentAt)} on ${formatDate(result.sentAt)}`
              : ""
          }.`,
        );
        return;
      }
      setNotice(
        `Proposal PDF emailed to ${result.to ?? "the client"} just now.`,
      );
    });
  };

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
          {fromEvent ? (
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy != null}
              onClick={() => void buildFromEvent(fromEvent._id)}
            >
              Build from event
            </button>
          ) : null}
          {fromEvent ? (
            <RecordAcceptedBeforeCapsule
              event={fromEvent}
              prompt={prompt}
              busy={busy}
              run={run}
              onNotice={setNotice}
              onOpen={(proposalId) => {
                setShowDraft(false);
                setSearchParams({ proposal: proposalId });
              }}
            />
          ) : null}
          <button
            className={fromEvent ? "btn btn-ghost" : "btn btn-primary"}
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
        {openRows.length > 0 ? (
          <input
            type="search"
            className="input my-3 min-h-10 w-full max-w-sm"
            placeholder="Find by title or client"
            aria-label="Find a proposal"
            value={find}
            onChange={(event) => setFind(event.target.value)}
          />
        ) : null}
        {loading ? (
          <TableSkeleton rows={5} />
        ) : visibleRows.length === 0 && needle ? (
          <p className="p-4 text-base text-ink-2">Nothing matches.</p>
        ) : visibleRows.length === 0 ? (
          <EmptyState
            title="No open proposals."
            hint="Draft an offer to start the sales conversation."
            action={
              showDraft ? undefined : (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => setShowDraft(true)}
                >
                  New proposal
                </button>
              )
            }
          />
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table proposal-table">
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
                    <tr id={`proposal-${row._id}`}>
                      <td>
                        <Link
                          className="text-link"
                          to={`/clients/proposals?proposal=${row._id}`}
                        >
                          {row.title}
                        </Link>
                        <ProposalChangeLabel
                          replacesProposalId={row.replacesProposalId}
                        />
                        <HistoricalAcceptanceLabel
                          source={row.acceptanceSource}
                          evidence={row.acceptanceEvidence}
                        />
                      </td>
                      <td>{clientDisplayName(row.clientId, clients)}</td>
                      <td className="supply-number">
                        {Number(row.total ?? 0) === 0 &&
                        !["declined", "expired"].includes(
                          String(row.status),
                        ) ? (
                          <span className="text-xs text-warn">
                            Not priced yet
                          </span>
                        ) : (
                          formatMoneyExact(Number(row.total ?? 0))
                        )}
                      </td>
                      <td>
                        <StatusChip status={String(row.status)} />
                        {row.status === "declined" && row.declineReason ? (
                          <small className="block text-ink-3">
                            {row.declineReason}
                          </small>
                        ) : null}
                      </td>
                      <td className="supply-row-actions">
                        <button
                          className="btn btn-ghost"
                          type="button"
                          aria-expanded={openRowId === row._id}
                          aria-controls={`proposal-tools-${row._id}`}
                          onClick={() =>
                            setOpenRowId((current) =>
                              current === row._id ? null : row._id,
                            )
                          }
                        >
                          {openRowId === row._id ? "Close" : "Open"}
                        </button>
                        {String(row.status) === "accepted" ? (
                          <>
                            {/* A linked event means the booking already exists —
                              offering Create Event again risks a duplicate. */}
                            {row.eventId ? (
                              <Link
                                className="btn btn-ghost"
                                to={eventDetailPath(String(row.eventId))}
                              >
                                View event
                              </Link>
                            ) : (
                              <Link
                                className="btn btn-ghost"
                                // proposalId pre-fills the form from the
                                // proposal and links the new event + copies the
                                // accepted menu onto it (issue #141).
                                to={eventCreatePath({
                                  clientId: String(row.clientId),
                                  proposalId: row._id,
                                })}
                              >
                                Create Event
                              </Link>
                            )}
                          </>
                        ) : null}
                      </td>
                    </tr>
                    {/* Every tool for one proposal, shown when the row is
                        open so the list reads as a list. */}
                    {openRowId === row._id ? (
                      <tr id={`proposal-tools-${row._id}`}>
                        <td colSpan={5}>
                          <div className="supply-row-actions flex-wrap">
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
                              disabled={
                                busy != null ||
                                (String(row.status) !== "draft" &&
                                  proposalRevisions === undefined) ||
                                (String(row.status) === "draft" &&
                                  (proposalDishSelections === undefined ||
                                    dishes === undefined))
                              }
                              onClick={() => {
                                const projected = pdfProjectionFor(row);
                                if (!projected) return;
                                void withPictureUrls(projected.proposal)
                                  .then((proposal) => {
                                    const pdfProjection = {
                                      ...projected,
                                      proposal,
                                    };
                                    if (pdfProjection.source) {
                                      return downloadProjectedProposalPdf({
                                        projection: pdfProjection,
                                        branding,
                                        download: downloadProposalPdf,
                                        onNotice: setNotice,
                                      });
                                    }
                                    return downloadProposalPdf({
                                      proposal: pdfProjection.proposal,
                                      clientName: pdfProjection.clientName,
                                      branding,
                                    }).then(() =>
                                      setNotice("Proposal PDF downloaded."),
                                    );
                                  })
                                  .catch((error) => setFailure(error));
                              }}
                            >
                              Download PDF
                            </button>
                            {["sent", "viewed", "accepted"].includes(
                              String(row.status),
                            ) && (
                              <button
                                className="btn btn-ghost"
                                type="button"
                                disabled={
                                  busy != null ||
                                  proposalRevisions === undefined
                                }
                                onClick={() => onEmailProposal(row)}
                              >
                                {busy === `${row._id}:email`
                                  ? "Emailing…"
                                  : "Email the proposal"}
                              </button>
                            )}
                            {["sent", "viewed", "accepted"].includes(
                              String(row.status),
                            ) && (
                              <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() =>
                                  setEmailsOpenFor((current) =>
                                    current === row._id ? null : row._id,
                                  )
                                }
                              >
                                {emailsOpenFor === row._id
                                  ? "Hide emails"
                                  : "Emails"}
                              </button>
                            )}
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
                            <ProposalSignatureRevokeAction
                              proposalId={row._id}
                              prompt={prompt}
                              busy={busy}
                              run={run}
                            />
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
                                    onClick={() =>
                                      invoke(row, "revokeShareLink")
                                    }
                                  >
                                    Revoke link
                                  </button>
                                )}
                              </>
                            )}
                            <LifecycleStepper
                              definition={proposalLifecycle}
                              status={String(row.status)}
                              actions={proposalLifecycle.actions.filter(
                                (candidate) =>
                                  policy
                                    .proposalActions(String(row.status))
                                    .some(
                                      (action) => action.key === candidate.key,
                                    ),
                              )}
                              busy={busy != null}
                              onAction={(key) => invoke(row, key)}
                            />
                            {String(row.status) === "sent" ||
                            String(row.status) === "viewed" ? (
                              <ProposalChangeAction
                                proposalId={row._id}
                                busy={busy}
                                run={run}
                                onNotice={setNotice}
                                accepted={false}
                              />
                            ) : null}
                            {String(row.status) === "accepted" ? (
                              <>
                                <ProposalChangeAction
                                  proposalId={row._id}
                                  busy={busy}
                                  run={run}
                                  onNotice={setNotice}
                                />
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    {openRowId === row._id ? (
                      <tr>
                        <td colSpan={5} className="pt-0">
                          <ProposalReadinessNotice
                            eventId={row.eventId ? String(row.eventId) : null}
                            status={String(row.status)}
                            total={Number(row.total ?? 0)}
                            hasVenue={(() => {
                              // A typed venue (quote form, import) counts too.
                              const linked = events?.find(
                                (e) => e._id === row.eventId,
                              );
                              return Boolean(
                                linked?.venueId || linked?.venueName?.trim(),
                              );
                            })()}
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
                          {String(row.status) === "draft" ? (
                            <ProposalDraftCheck
                              proposalId={row._id}
                              onFailure={setFailure}
                              onNotice={setNotice}
                            />
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                    {menuOpenFor === row._id ? (
                      <tr>
                        <td colSpan={5}>
                          <ProposalMenuSelectionPanel
                            proposalId={row._id}
                            guestCount={Number(row.guestCount ?? 0)}
                            editable={MENU_EDITABLE_STATUSES.includes(
                              String(row.status),
                            )}
                            draft={String(row.status) === "draft"}
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
                          <ProposalTermsPanel
                            proposal={row}
                            editable={String(row.status) === "draft"}
                            onFailure={setFailure}
                            onNotice={setNotice}
                          />
                          <ProposalPaymentSchedulePanel
                            proposal={row}
                            editable={String(row.status) === "draft"}
                            onFailure={setFailure}
                            onNotice={setNotice}
                          />
                        </td>
                      </tr>
                    ) : null}
                    {emailsOpenFor === row._id ? (
                      <tr>
                        <td colSpan={5}>
                          <ProposalEmailHistory
                            proposalId={row._id}
                            refreshKey={emailsKey}
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
        {!loading && proposalPages.canLoadMore ? (
          <div className="px-4 py-3">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={proposalPages.loadingMore}
              onClick={proposalPages.loadMore}
            >
              {proposalPages.loadingMore ? "Loading…" : "Load older proposals"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
