import { parseNaturalDate } from "../../ui/naturalDate";

const MONTH =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/**
 * The guest count and event date an inquiry states in plain words ("lunch for
 * 40 people on Nov 12"). Either is left out when the message does not say it;
 * the salesperson checks the lead anyway.
 */
export function readInquiryFacts(
  text: string,
  now: Date = new Date(),
): { guestCount?: number; eventDate?: number } {
  const facts: { guestCount?: number; eventDate?: number } = {};
  const guests = text.match(
    /(?:about|around|~)?\s*(\d{1,4})\s*(?:people|guests|persons|pax|ppl|attendees)/i,
  );
  if (guests) facts.guestCount = Number(guests[1]);
  const day = text.match(
    new RegExp(
      `(?:${MONTH})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?`,
      "i",
    ),
  );
  if (day) {
    const parsed = parseNaturalDate(
      day[0].replace(/(\d)(st|nd|rd|th)\b/i, "$1"),
      {
        kind: "date",
        now,
      },
    );
    // Local noon, so no time zone moves the calendar day.
    if (parsed.ok)
      facts.eventDate = new Date(`${parsed.value}T12:00:00`).getTime();
  }
  return facts;
}

/** A readable name from who wrote: "maria.lopez@x.test" → "Maria Lopez". */
export function senderName(sender: string): string {
  const trimmed = sender.trim();
  const email = trimmed.match(/^([^@\s]+)@[^@\s]+\.[^@\s]+$/);
  if (email) {
    return email[1]
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return trimmed.replace(/^@/, "");
}
