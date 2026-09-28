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

export function deliveryStatusLabel(status: string): string | null {
  if (status === "queued")
    return "Queued — not delivered; no provider is connected";
  if (status === "failed") return "Delivery failed — not delivered";
  return null;
}
