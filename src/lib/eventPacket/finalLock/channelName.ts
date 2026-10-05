/**
 * The name of an event's channel in an outside team chat:
 * event-number-event-name, lower case, words joined by hyphens (the form
 * Slack channel names take). Null until the event has a number.
 */
export function externalChannelName(
  eventNumber: string | null,
  title: string,
): string | null {
  const number = eventNumber?.trim();
  if (!number) return null;
  const words = `${number} ${title}`
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return words.slice(0, 80).replace(/-+$/, "");
}
