export interface ReplyDisposition {
  canRecord: boolean;
  notice?: string;
}

export function replyDisposition(provider: string): ReplyDisposition {
  if (provider === "internal") return { canRecord: true };
  return {
    canRecord: false,
    notice:
      "No external delivery provider is connected, so this can't be sent. Your draft is kept — copy it into your email, SMS, or social provider.",
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
