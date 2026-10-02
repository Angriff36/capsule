// AUTHOR-OWNED — "Email the proposal" (PL-OUTBOUND, AC-107/AC-109/AC-352).
// The screen builds the PDF from the proposal's published version (the same
// file Download PDF gives); this step refuses it unless that version is still
// the newest one, sends it with the proposal email, and keeps the same send
// record as an invoice email: recipient (masked), sender, template + version,
// published version, attachment, fingerprint of the exact email and PDF and
// the email service's id. The same version is not emailed twice in a day.
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  artifactFingerprint,
  classifyReminderFailure,
  emailServiceFailureKind,
  maskEmail,
  ReminderDeliveryError,
  reminderRemedy,
  RECENT_SEND_WINDOW_MS,
} from "./lib/reminderDelivery";
import {
  clientRecipientAndCompany,
  fromAddress,
  safeProviderMessage,
} from "./invoiceReminders";
import {
  PROPOSAL_EMAIL_TEMPLATE,
  renderProposalEmail,
} from "../src/lib/proposalEmail";

const EVENT = {
  sent: "ProposalEmailSent",
  failed: "ProposalEmailFailed",
} as const;

/** Sent, opened or accepted: a proposal the client may get by email. */
const EMAILABLE_STATUSES = new Set(["sent", "viewed", "accepted"]);
const MAX_PDF_BYTES = 8 * 1024 * 1024;

export interface ProposalEmailResult {
  status: "sent" | "already_sent";
  emailId?: string;
  to?: string;
  sentAt?: number;
}

export const loadContext = internalQuery({
  args: { proposalId: v.id("proposals"), tenantId: v.string() },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.tenantId !== args.tenantId) return null;
    const [revisions, people, ledger, shareLinks] = await Promise.all([
      ctx.db
        .query("proposalRevisions")
        .withIndex("by_proposalId", (q) => q.eq("proposalId", proposal._id))
        .collect(),
      clientRecipientAndCompany(ctx, args.tenantId, proposal.clientId),
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q) => q.eq("entityId", String(proposal._id)))
        .collect(),
      ctx.db
        .query("shareLinks")
        .withIndex("by_proposalId", (q) => q.eq("proposalId", proposal._id))
        .collect(),
    ]);
    const latest = revisions
      .filter((row) => row.tenantId === args.tenantId && row.deletedAt == null)
      .sort((left, right) => right.revisionNumber - left.revisionNumber)[0];
    const now = Date.now();
    const shareLink = latest
      ? shareLinks.find(
          (row) =>
            row.tenantId === args.tenantId &&
            row.deletedAt == null &&
            row.status === "active" &&
            row.proposalRevisionId === latest._id &&
            (row.expiresAt == null || row.expiresAt > now),
        )
      : undefined;
    return {
      proposal: proposal as Doc<"proposals">,
      latestRevision: latest
        ? { id: String(latest._id), number: latest.revisionNumber }
        : null,
      shareLinkId: shareLink ? String(shareLink._id) : null,
      ...people,
      sends: ledger
        .filter(
          (row) =>
            row.entity === "Proposal" &&
            row.type === EVENT.sent &&
            (row.payload as { tenantId?: unknown })?.tenantId === args.tenantId,
        )
        .map((row) => ({
          createdAt: row.createdAt,
          payload: row.payload as Record<string, unknown>,
        })),
    };
  },
});

export const recordEvent = internalMutation({
  args: {
    type: v.union(v.literal(EVENT.sent), v.literal(EVENT.failed)),
    proposalId: v.id("proposals"),
    payload: v.any(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.insert("manifestEvents", {
      type: args.type,
      entity: "Proposal",
      entityId: String(args.proposalId),
      payload: args.payload,
      createdAt: Date.now(),
    });
  },
});

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function appOrigin(): string | null {
  const raw = process.env.CAPSULE_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

export const send = action({
  args: {
    proposalId: v.id("proposals"),
    /** The published version the PDF was built from. */
    revisionId: v.string(),
    pdfBase64: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, args): Promise<ProposalEmailResult> => {
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const configuredFrom = process.env.INVOICE_REMINDER_FROM_EMAIL?.trim();
    if (!resendApiKey || !configuredFrom) {
      throw new ConvexError(reminderRemedy("not_set_up"));
    }
    const auth = await getAuthContext(ctx);
    const visible = await ctx.runQuery(api.queries.getProposal, {
      id: args.proposalId,
    });
    if (!visible || !auth.tenantId || auth.tenantId !== visible.tenantId) {
      throw new ConvexError(
        "Proposal unavailable. Check your workspace access.",
      );
    }
    const tenantId = visible.tenantId;
    const context = await ctx.runQuery(internal.proposalEmail.loadContext, {
      proposalId: args.proposalId,
      tenantId,
    });
    if (!context) {
      throw new ConvexError(
        "Proposal unavailable. Check your workspace access.",
      );
    }
    const { proposal } = context;
    if (
      proposal.deletedAt != null ||
      !EMAILABLE_STATUSES.has(String(proposal.status))
    ) {
      throw new ConvexError(
        "Send the proposal in Capsule first, then email it to the client.",
      );
    }
    if (!context.latestRevision) {
      throw new ConvexError(
        "This proposal has no published version to email. Send it again from a draft.",
      );
    }
    if (context.latestRevision.id !== args.revisionId) {
      throw new ConvexError(
        "This proposal changed since the page loaded. Reload the page, then email it again.",
      );
    }
    const pdf = base64ToBytes(args.pdfBase64);
    const pdfHeader = String.fromCharCode(...pdf.subarray(0, 5));
    if (pdfHeader !== "%PDF-" || pdf.length > MAX_PDF_BYTES) {
      throw new ConvexError(
        "The proposal PDF could not be made. Reload the page and try again.",
      );
    }

    const now = Date.now();
    const recent = context.sends
      .filter(
        (row) =>
          row.payload.revisionId === args.revisionId &&
          now - row.createdAt < RECENT_SEND_WINDOW_MS,
      )
      .sort((left, right) => right.createdAt - left.createdAt)[0];
    if (recent) {
      return {
        status: "already_sent",
        sentAt: recent.createdAt,
        to:
          typeof recent.payload.recipientMasked === "string"
            ? recent.payload.recipientMasked
            : undefined,
      };
    }

    const record = (
      type: (typeof EVENT)[keyof typeof EVENT],
      payload: Record<string, unknown>,
    ) =>
      ctx.runMutation(internal.proposalEmail.recordEvent, {
        type,
        proposalId: args.proposalId,
        payload: {
          tenantId,
          revisionId: args.revisionId,
          revisionNumber: context.latestRevision?.number ?? null,
          source: "manual",
          attempt: 0,
          ...payload,
        },
      });

    try {
      if (!context.recipient) {
        throw new ReminderDeliveryError(
          "no_recipient",
          "No client account or active contact email is available.",
        );
      }
      const recipient = context.recipient;
      const origin = appOrigin();
      const email = renderProposalEmail({
        companyName: context.organization.displayName,
        companyAddress: context.organization.address,
        primaryColor: context.organization.primaryColor,
        accentColor: context.organization.accentColor,
        clientName: recipient.name,
        title: proposal.title,
        proposalNumber: proposal.proposalNumber ?? null,
        total: Number(proposal.total ?? 0),
        eventDate: proposal.eventDate ?? null,
        viewUrl:
          origin && context.shareLinkId
            ? `${origin}/share/${context.shareLinkId}`
            : null,
      });
      const from = fromAddress(context.organization.senderName, configuredFrom);
      const replyTo = context.organization.replyTo;
      const attachmentName =
        args.fileName
          .replace(/[^\w.\- ]/gu, "")
          .trim()
          .slice(0, 120) || "proposal.pdf";
      let response: Response;
      try {
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `proposal-send/${args.proposalId}/${args.revisionId}`,
          },
          body: JSON.stringify({
            from,
            to: [recipient.email],
            ...(replyTo ? { reply_to: replyTo } : {}),
            subject: email.subject,
            html: email.html,
            text: email.text,
            attachments: [
              { filename: attachmentName, content: args.pdfBase64 },
            ],
            tags: [
              { name: "category", value: PROPOSAL_EMAIL_TEMPLATE.id },
              { name: "proposal_id", value: String(args.proposalId) },
            ],
          }),
        });
      } catch (cause) {
        throw new ReminderDeliveryError(
          "service_down",
          `Email service unreachable: ${safeProviderMessage(cause)}`,
        );
      }
      const body = (await response.json().catch(() => null)) as {
        id?: unknown;
      } | null;
      if (!response.ok) {
        throw new ReminderDeliveryError(
          emailServiceFailureKind(response.status),
          `Proposal email failed (${response.status}).`,
        );
      }
      if (typeof body?.id !== "string" || !body.id) {
        throw new Error("Email provider did not return a delivery id.");
      }
      const emailId = body.id;
      await record(EVENT.sent, {
        emailId,
        providerState: "accepted",
        recipientMasked: maskEmail(recipient.email),
        recipientSource: recipient.source,
        recipientContactId: recipient.contactId,
        sender: from,
        replyTo,
        subject: email.subject,
        template: PROPOSAL_EMAIL_TEMPLATE.id,
        templateVersion: PROPOSAL_EMAIL_TEMPLATE.version,
        attachments: [attachmentName],
        artifactFingerprint: await artifactFingerprint([
          email.subject,
          email.text,
          email.html,
          pdf,
        ]),
      });
      try {
        await ctx.runMutation(
          internal.outboundEmailThread.recordProposalEmail,
          {
            tenantId,
            proposalId: args.proposalId as Id<"proposals">,
            senderAddress: configuredFrom,
            recipientLabel: `${recipient.name} (${maskEmail(recipient.email)})`,
            contactId: recipient.contactId,
            subject: email.subject,
            bodyText: email.text,
            providerMessageId: emailId,
            sentAt: Date.now(),
          },
        );
      } catch (cause) {
        console.error(
          `Proposal email ${emailId} sent but not added to the conversation: ${safeProviderMessage(cause)}`,
        );
      }
      return { status: "sent", emailId, to: maskEmail(recipient.email) };
    } catch (cause) {
      const { kind, remedy } = classifyReminderFailure(cause);
      await record(EVENT.failed, {
        message: safeProviderMessage(cause),
        failureKind: kind,
        remedy,
        recipientMasked: context.recipient
          ? maskEmail(context.recipient.email)
          : null,
      });
      throw new ConvexError(remedy);
    }
  },
});
