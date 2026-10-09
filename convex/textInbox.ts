/**
 * AUTHOR SEAM — client texts come into the company inbox (PL-INBOX, AC-104,
 * AC-247). Each company sets its own texting number (Organization.smsNumber,
 * a number on Capsule's Twilio account). Twilio sends every text a client
 * writes to that number to POST /twilio/sms; Capsule checks Twilio's
 * signature, finds the company by the number the text went to, and keeps the
 * text in one conversation per client phone. A repeated delivery of the same
 * text (same Twilio message id) adds nothing. A text to a number no company
 * uses is answered and dropped.
 */
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction, internalMutation, query } from "./_generated/server";
import type { MessageMediaRef } from "./lib/messageMedia";
import { redactSecrets } from "./lib/redactPayload";
import { TenantSystemCommandRunner } from "./lib/tenantSystemCommandRunner";
import { twilioSignatureMatches } from "./lib/twilioSignature";

export const TEXT_ROUTE_PATH = "/twilio/sms";
const MAX_RAW_PAYLOAD = 8192;
const MAX_MEDIA = 20;
const EMPTY_REPLY =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Phone in +E.164 form; a 10-digit number is taken as North American. */
export function normalizePhone(phone: string | null | undefined): string {
  const trimmed = (phone ?? "").trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (trimmed.startsWith("+")) return `+${digits}`;
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

/** Photos and files on a Twilio text: the media id and kind, never the link. */
export function twilioMediaRefs(form: Map<string, string>): MessageMediaRef[] {
  const count = Math.min(Number(form.get("NumMedia") ?? 0) || 0, MAX_MEDIA);
  const refs: MessageMediaRef[] = [];
  for (let i = 0; i < count; i += 1) {
    const url = form.get(`MediaUrl${i}`) ?? "";
    const id = url.split("/").filter(Boolean).pop();
    if (!id) continue;
    refs.push({ id, kind: form.get(`MediaContentType${i}`) || "file" });
  }
  return refs;
}

function storedPayload(form: Map<string, string>): string | undefined {
  const kept: Record<string, string> = {};
  for (const [key, value] of form) {
    if (!key.startsWith("MediaUrl")) kept[key] = value;
  }
  const text = JSON.stringify(redactSecrets(kept));
  return text.length <= MAX_RAW_PAYLOAD ? text : undefined;
}

/** Stores one client text for the company that owns the number it went to. */
export const ingestText = internalMutation({
  args: {
    to: v.string(),
    from: v.string(),
    body: v.string(),
    messageSid: v.string(),
    mediaJson: v.optional(v.string()),
    rawPayload: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { result: "unknown_number" }
    | {
        result: "stored" | "duplicate";
        threadId: Id<"messageThreads">;
        messageId: Id<"messages">;
      }
  > => {
    const to = normalizePhone(args.to);
    const from = normalizePhone(args.from);
    const company = (await ctx.db.query("organizations").collect()).find(
      (org) =>
        org.deletedAt == null &&
        to !== "" &&
        normalizePhone(org.smsNumber) === to,
    );
    if (!company || !from) return { result: "unknown_number" };
    const tenantId = company.tenantId;
    const system = TenantSystemCommandRunner.forTenant(ctx, tenantId).context;

    const thread = (
      await ctx.db
        .query("messageThreads")
        .withIndex("by_providerThreadId", (q) => q.eq("providerThreadId", from))
        .collect()
    ).find(
      (t) =>
        t.tenantId === tenantId &&
        t.provider === "sms" &&
        t.providerAccountId === to &&
        t.deletedAt == null,
    );
    let threadId: Id<"messageThreads">;
    if (thread) {
      threadId = thread._id;
    } else {
      const phoneKey = from.replace(/\D/g, "").slice(-10);
      const contacts = (
        await ctx.db
          .query("clientContacts")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .collect()
      ).filter(
        (c) =>
          c.deletedAt == null &&
          [c.phone, c.mobile].some(
            (p) => (p ?? "").replace(/\D/g, "").slice(-10) === phoneKey,
          ),
      );
      const created = await system.runMutation(
        api.mutations.MessageThread_create,
        {
          provider: "sms",
          providerAccountId: to,
          providerThreadId: from,
          senderIdentity: from,
          contactId: contacts.length === 1 ? contacts[0]!._id : undefined,
          idempotencyKey: `tenant-shared/mt:sms:${to}:${from}`,
        },
      );
      threadId = created._id;
    }

    const existing = (
      await ctx.db
        .query("messages")
        .withIndex("by_providerMessageId", (q) =>
          q.eq("providerMessageId", args.messageSid),
        )
        .collect()
    ).find((m) => m.threadId === threadId && m.deletedAt == null);
    if (existing) {
      return { result: "duplicate", threadId, messageId: existing._id };
    }

    const media = args.mediaJson
      ? (JSON.parse(args.mediaJson) as unknown[])
      : [];
    const bodyText =
      args.body.trim() ||
      (media.length === 1
        ? "Sent a photo or file."
        : `Sent ${media.length} photos or files.`);
    const posted = await system.runMutation(
      api.mutations.Message_createViaPost,
      {
        threadId,
        direction: "inbound",
        status: "received",
        bodyText,
        providerMessageId: args.messageSid,
        senderIdentity: from,
        sentAt: Date.now(),
        rawPayload: args.rawPayload,
        mediaJson: args.mediaJson,
        idempotencyKey: `tenant-shared/msg:${threadId}:${args.messageSid}`,
      },
    );
    return { result: "stored", threadId, messageId: posted.docId };
  },
});

/** POST /twilio/sms — Twilio's "a message comes in" webhook. */
export const receiveText = httpAction(async (ctx, request) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) return new Response("Texts are not set up.", { status: 503 });

  const params = [...new URLSearchParams(await request.text())] as Array<
    [string, string]
  >;
  const signature = request.headers.get("X-Twilio-Signature") ?? "";
  // Behind a proxy the URL Twilio called can differ from the one this
  // server sees, so the public site address is also tried.
  const requestUrl = new URL(request.url);
  const urls = [request.url];
  const site = process.env.CONVEX_SITE_URL?.trim().replace(/\/$/, "");
  if (site) urls.push(`${site}${requestUrl.pathname}${requestUrl.search}`);
  let signed = false;
  for (const url of urls) {
    if (await twilioSignatureMatches({ authToken, url, params, signature })) {
      signed = true;
      break;
    }
  }
  if (!signed)
    return new Response("Signature does not match.", { status: 403 });

  const form = new Map(params);
  const messageSid = form.get("MessageSid") ?? form.get("SmsSid") ?? "";
  const body = form.get("Body") ?? "";
  const media = twilioMediaRefs(form);
  if (messageSid && (body.trim() || media.length > 0)) {
    await ctx.runMutation(internal.textInbox.ingestText, {
      to: form.get("To") ?? "",
      from: form.get("From") ?? "",
      body,
      messageSid,
      mediaJson: media.length > 0 ? JSON.stringify(media) : undefined,
      rawPayload: storedPayload(form),
    });
  }
  return new Response(EMPTY_REPLY, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
});

/** What a company needs to point its Twilio number at Capsule. */
export const textSetup = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ address: string | null; textsReady: boolean } | null> => {
    if (!(await ctx.auth.getUserIdentity())) return null;
    const site = process.env.CONVEX_SITE_URL?.trim().replace(/\/$/, "");
    return {
      address: site ? `${site}${TEXT_ROUTE_PATH}` : null,
      textsReady: Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()),
    };
  },
});
