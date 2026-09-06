export interface ReplyDisposition {
  canRecord: boolean;
  notice?: string;
}

export function replyDisposition(provider: string): ReplyDisposition {
  if (provider === "internal") return { canRecord: true };
  return {
    canRecord: false,
    notice:
      "Cannot send: no external delivery provider is connected. Your draft is preserved; copy it into your email, SMS, or social provider.",
  };
}

export function deliveryStatusLabel(status: string): string | null {
  if (status === "queued") return "Delivery queued";
  if (status === "failed") return "Delivery failed";
  return null;
}
