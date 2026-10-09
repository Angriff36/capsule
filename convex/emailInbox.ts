/**
 * AUTHOR SEAM — client emails come into the company inbox (PL-INBOX, AC-104,
 * AC-207, AC-633). Every company gets its own inbox address at Capsule's
 * receiving domain (RESEND_INBOUND_DOMAIN), built from its company key, so
 * nothing needs setting up per company. Capsule's client emails use that
 * address as the reply address when the company has not chosen its own, so a
 * client's answer comes straight back; a company can also forward its own
 * mailbox to it.
 *
 * The email service posts each received email to POST /resend/inbound.
 * Capsule checks the signature and its time (RESEND_WEBHOOK_SECRET), reads
 * the email's text from the email service, finds the company by the address
 * it went to, and keeps it in one conversation per client email address. The
 * same email delivered again (same email id) adds nothing. If the email
 * service cannot be read, Capsule answers with an error so the email service
 * sends the email again later.
 */
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction, internalMutation, query } from "./_generated/server";
import type { MessageMediaRef } from "./lib/messageMedia";
import { getAuthContext } from "./lib/authContext";
import {
  companyInboxAddress,
  inboundDomain,
  inboxLocalPart,
} from "./lib/emailInboxAddress";
import {
  lastInboxArrivalAt,
  recordInboxArrival,
} from "./lib/inboxConnectionMirror";
import { redactSecrets } from "./lib/redactPayload";
import { svixSignatureMatches } from "./lib/svixSignature";
import { TenantSystemCommandRunner } from "./lib/tenantSystemCommandRunner";

export const EMAIL_ROUTE_PATH = "/resend/inbound";
const MAX_BODY = 20000;
const MAX_RAW_PAYLOAD = 8192;
const MAX_MEDIA = 20;
const EMAIL_PATTERN = /[^\s<>"',;:]+@[^\s<>"',;:]+\.[^\s<>"',;:]+/u;

/** The bare address in "Name <a@b.com>", lower case. */
export function emailAddressOf(value: string | null | undefined): string {
  const match = value ? EMAIL_PATTERN.exec(value) : null;
  return match ? match[0].toLowerCase() : "";
}

/** Plain text of an email: its text part, or its HTML with the tags taken out. */
export function emailBodyText(text: unknown, html: unknown): string {
  if (typeof text === "string" && text.trim())
    return text.trim().slice(0, MAX_BODY);
  if (typeof html !== "string") return "";
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim()
    .slice(0, MAX_BODY);
}

/** Files on an email: id, kind and name only, never a download link. */
export function emailMediaRefs(attachments: unknown): MessageMediaRef[] {
  if (!Array.isArray(attachments)) return [];
  const refs: MessageMediaRef[] = [];
  for (const item of attachments.slice(0, MAX_MEDIA)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id) continue;
    refs.push({
      id: row.id,
      kind:
        typeof row.content_type === "string" && row.content_type
          ? row.content_type
          : "file",
      ...(typeof row.filename === "string" && row.filename
        ? { name: row.filename.slice(0, 200) }
        : {}),
    });
  }
  return refs;
}

/** Stores one client email for the company whose inbox address it went to. */
export const ingestEmail = internalMutation({
  args: {
    to: v.array(v.string()),
    from: v.string(),
    subject: v.string(),
    body: v.string(),
    emailId: v.string(),
    sentAt: v.optional(v.number()),
    mediaJson: v.optional(v.string()),
    rawPayload: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { result: "unknown_address" }
    | {
        result: "stored" | "duplicate";
        threadId: Id<"messageThreads">;
        messageId: Id<"messages">;
      }
  > => {
    const domain = inboundDomain();
    const from = emailAddressOf(args.from);
    if (!domain || !from) return { result: "unknown_address" };
    // The company is the one whose key is before the @ (a "+note" after the
    // key is allowed). Two companies with the same key get nothing.
    const keys = new Set(
      args.to
        .map(emailAddressOf)
        .filter((address) => address.endsWith(`@${domain}`))
        .map((address) => address.split("@")[0]!.split("+")[0]!),
    );
    const companies = (await ctx.db.query("organizations").collect()).filter(
      (org) => org.deletedAt == null && keys.has(inboxLocalPart(org.tenantId)),
    );
    const tenants = new Set(companies.map((org) => org.tenantId));
    if (tenants.size !== 1) return { result: "unknown_address" };
    const tenantId = companies[0]!.tenantId;
    const inbox = companyInboxAddress(tenantId)!;
    const system = TenantSystemCommandRunner.forTenant(ctx, tenantId).context;

    const thread = (
      await ctx.db
        .query("messageThreads")
        .withIndex("by_providerThreadId", (q) => q.eq("providerThreadId", from))
        .collect()
    ).find(
      (t) =>
        t.tenantId === tenantId &&
        t.provider === "email" &&
        t.providerAccountId === inbox &&
        t.deletedAt == null,
    );
    let threadId: Id<"messageThreads">;
    if (thread) {
      threadId = thread._id;
    } else {
      // Contact emails are stored scrambled, so read them through the
      // company's own client list, which unscrambles them.
      const contacts = (
        await system.runQuery(api.queries.listClientContact, {})
      ).filter(
        (c) =>
          c.deletedAt == null && (c.email ?? "").trim().toLowerCase() === from,
      );
      const created = await system.runMutation(
        api.mutations.MessageThread_create,
        {
          provider: "email",
          providerAccountId: inbox,
          providerThreadId: from,
          subject: args.subject.trim() || undefined,
          senderIdentity: args.from.trim() || from,
          contactId: contacts.length === 1 ? contacts[0]!._id : undefined,
          idempotencyKey: `tenant-shared/mt:email:${inbox}:${from}`,
        },
      );
      threadId = created._id;
    }

    const existing = (
      await ctx.db
        .query("messages")
        .withIndex("by_providerMessageId", (q) =>
          q.eq("providerMessageId", args.emailId),
        )
        .collect()
    ).find((m) => m.threadId === threadId && m.deletedAt == null);
    if (existing) {
      return { result: "duplicate", threadId, messageId: existing._id };
    }

    const media = args.mediaJson
      ? (JSON.parse(args.mediaJson) as unknown[])
      : [];
    const subject = args.subject.trim();
    const text =
      args.body.trim() ||
      (media.length === 0
        ? "(No message text.)"
        : media.length === 1
          ? "Sent a file."
          : `Sent ${media.length} files.`);
    const posted = await system.runMutation(
      api.mutations.Message_createViaPost,
      {
        threadId,
        direction: "inbound",
        status: "received",
        bodyText: subject ? `${subject}\n\n${text}` : text,
        providerMessageId: args.emailId,
        senderIdentity: args.from.trim() || from,
        sentAt: args.sentAt ?? Date.now(),
        rawPayload: args.rawPayload,
        mediaJson: args.mediaJson,
        idempotencyKey: `tenant-shared/msg:${threadId}:${args.emailId}`,
      },
    );
    await recordInboxArrival(ctx, tenantId, "email", inbox);
    return { result: "stored", threadId, messageId: posted.docId };
  },
});

/** POST /resend/inbound — the email service's "email received" webhook. */
export const receiveEmail = httpAction(async (ctx, request) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!secret || !apiKey || !inboundDomain())
    return new Response("Client emails are not set up.", { status: 503 });

  const body = await request.text();
  const signed = await svixSignatureMatches({
    secret,
    id: request.headers.get("svix-id") ?? "",
    timestamp: request.headers.get("svix-timestamp") ?? "",
    body,
    signature: request.headers.get("svix-signature") ?? "",
  });
  if (!signed)
    return new Response("Signature does not match.", { status: 403 });

  let event: { type?: unknown; data?: { email_id?: unknown } };
  try {
    event = JSON.parse(body) as typeof event;
  } catch {
    return new Response("Not readable.", { status: 400 });
  }
  const emailId = event.data?.email_id;
  if (
    event.type !== "email.received" ||
    typeof emailId !== "string" ||
    !emailId
  )
    return new Response("Ignored.", { status: 200 });

  // The webhook carries no text, so read the email itself.
  const read = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
    { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } },
  ).catch(() => null);
  if (!read || !read.ok)
    return new Response("Could not read the email yet.", { status: 502 });
  const email = (await read.json()) as Record<string, unknown>;

  const to = [
    ...(Array.isArray(email.to) ? email.to : []),
    ...(Array.isArray(email.received_for) ? email.received_for : []),
  ].filter((value): value is string => typeof value === "string");
  const media = emailMediaRefs(email.attachments);
  const sentAt = Date.parse(String(email.created_at ?? ""));
  const kept = redactSecrets({
    id: email.id,
    from: email.from,
    to: email.to,
    subject: email.subject,
    created_at: email.created_at,
    message_id: email.message_id,
    authentication: email.authentication,
  });
  const raw = JSON.stringify(kept);
  await ctx.runMutation(internal.emailInbox.ingestEmail, {
    to,
    from: typeof email.from === "string" ? email.from : "",
    subject:
      typeof email.subject === "string" ? email.subject.slice(0, 500) : "",
    body: emailBodyText(email.text, email.html),
    emailId,
    sentAt: Number.isFinite(sentAt) ? sentAt : undefined,
    mediaJson: media.length > 0 ? JSON.stringify(media) : undefined,
    rawPayload: raw.length <= MAX_RAW_PAYLOAD ? raw : undefined,
  });
  return new Response("OK", { status: 200 });
});

/** The company's inbox address and what the email service must point at. */
export const emailSetup = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    inboxAddress: string | null;
    webhookAddress: string | null;
    emailsReady: boolean;
    lastEmailAt: number | null;
  } | null> => {
    if (!(await ctx.auth.getUserIdentity())) return null;
    const auth = await getAuthContext(ctx);
    const tenantId = auth.tenantId;
    const site = process.env.CONVEX_SITE_URL?.trim().replace(/\/$/, "");
    const inboxAddress =
      typeof tenantId === "string" ? companyInboxAddress(tenantId) : null;
    return {
      inboxAddress,
      lastEmailAt:
        typeof tenantId === "string" && inboxAddress
          ? await lastInboxArrivalAt(ctx, tenantId, "email", inboxAddress)
          : null,
      webhookAddress: site ? `${site}${EMAIL_ROUTE_PATH}` : null,
      emailsReady: Boolean(
        process.env.RESEND_WEBHOOK_SECRET?.trim() &&
        process.env.RESEND_API_KEY?.trim() &&
        inboundDomain(),
      ),
    };
  },
});
