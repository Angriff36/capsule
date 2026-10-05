/**
 * When a message was really sent: the provider's own send time when it gave
 * one, else when Capsule saved it. Providers resend and deliver late, so a
 * message that arrives after a newer one still sits in the order it was sent.
 */
export function messageTime(message: {
  sentAt?: number | null;
  createdAt?: number | null;
}): number {
  return message.sentAt ?? message.createdAt ?? 0;
}
