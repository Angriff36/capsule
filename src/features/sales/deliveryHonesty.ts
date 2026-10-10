export interface ReplyDisposition {
  canRecord: boolean;
  notice?: string;
}

export function replyDisposition(provider: string): ReplyDisposition {
  if (provider === "internal") return { canRecord: true };
  return {
    canRecord: false,
    notice:
      "Capsule cannot send social messages yet. Your draft is kept — copy it into the app the client used.",
  };
}

// PL-INBOX (AC-106): an outside thread names every delivery state. "sent"
// only means the provider took the message, never that the client got it.
// An internal note is recorded, not delivered, so it carries no label.
const OUTSIDE_DELIVERY_LABEL: Record<string, string> = {
  sent: "Accepted by the provider — delivery not confirmed",
  delivered: "Delivered",
  bounced: "Bounced — not delivered",
  unknown: "Delivery not known",
};

export function deliveryStatusLabel(
  status: string,
  provider = "internal",
): string | null {
  if (status === "queued")
    return "Queued — not delivered; no provider is connected";
  if (status === "failed") return "Delivery failed — not delivered";
  if (provider === "internal") return null;
  return OUTSIDE_DELIVERY_LABEL[status] ?? "Delivery not known";
}
