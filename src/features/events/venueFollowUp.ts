// After-event follow-up at a partner venue (Venue Partner Playbook section 13):
// thank the venue within 24 hours, collect the client's answers about the
// venue within 72 hours, debrief the team within 48 hours. Pure, so the event
// page and its proof read the same rules. Lateness is a warning, never a block.

const HOUR = 3_600_000;

export type FollowUpKind =
  "thank_you" | "client_feedback" | "debrief" | "social_post";

export const FOLLOW_UP_STEPS: readonly {
  kind: FollowUpKind;
  title: string;
  hours: number;
}[] = [
  { kind: "thank_you", title: "Thank the venue", hours: 24 },
  { kind: "debrief", title: "Team debrief", hours: 48 },
  { kind: "client_feedback", title: "Client feedback", hours: 72 },
  // Playbook section 06: post within 48 hours, then send it to the venue.
  { kind: "social_post", title: "Social post", hours: 48 },
];

export interface FollowUpNoteRow {
  venueId: string;
  eventId?: string | null;
  category: string;
  content?: string | null;
  rating?: number | null;
  authorName?: string | null;
  postedAt?: number | null;
  deletedAt?: number | null;
}

export interface FollowUpStepState {
  kind: FollowUpKind;
  title: string;
  dueAt: number;
  done: FollowUpNoteRow | null;
  late: boolean;
}

/** Each step's due time and the note that finished it, as of `now`. */
export function followUpSteps(input: {
  venueId: string;
  eventId: string;
  /** The event's end, or its start when no end is set. */
  endedAt: number;
  notes: readonly FollowUpNoteRow[];
  now: number;
}): FollowUpStepState[] {
  return FOLLOW_UP_STEPS.map((step) => {
    const done =
      input.notes
        .filter(
          (note) =>
            note.deletedAt == null &&
            note.postedAt != null &&
            note.category === step.kind &&
            String(note.venueId) === input.venueId &&
            String(note.eventId ?? "") === input.eventId,
        )
        .sort((a, b) => Number(b.postedAt) - Number(a.postedAt))[0] ?? null;
    const dueAt = input.endedAt + step.hours * HOUR;
    return { ...step, dueAt, done, late: !done && input.now > dueAt };
  });
}

/**
 * The follow-up shows at a partner venue once the event has started, or once
 * it is marked completed.
 */
export function followUpApplies(input: {
  partnerTier?: string | null;
  stage?: string | null;
  startsAt?: number | null;
  now: number;
}): boolean {
  return (
    Boolean(input.partnerTier) &&
    input.stage !== "cancelled" &&
    (input.stage === "completed" ||
      (input.startsAt != null && input.startsAt <= input.now))
  );
}

const firstName = (name?: string | null) =>
  (name ?? "").trim().split(/\s+/)[0] ?? "";

const sentence = (value: string) =>
  /[.!?]$/.test(value.trim()) ? value.trim() : `${value.trim()}.`;

/** Playbook "Post-event thank you" text. */
export function thankYouText(input: {
  contactName?: string | null;
  venueName: string;
  highlight: string;
  issue: string;
  repName: string;
}): string {
  const name = firstName(input.contactName);
  const highlight = input.highlight.trim();
  const issue = input.issue.trim();
  return [
    `Hey${name ? ` ${name}` : ""}, just wanted to say thanks for another great event at ${sentence(input.venueName)}`,
    highlight ? sentence(highlight) : "",
    issue
      ? `One thing I wanted to flag: ${sentence(issue)} I'll have a summary to you soon.`
      : "",
    `Hope you have a great rest of your week!${input.repName ? ` - ${input.repName}` : ""}`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** "#Spokane Valley" -> "#SpokaneValley"; empty when nothing is left. */
const hashtag = (value: string) => {
  const words = value.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length
    ? `#${words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join("")}`
    : "";
};

/** The company name for its hashtag: "Mangia Catering Co." -> MangiaCatering. */
const companyTag = (name: string) =>
  hashtag(name.replace(/\b(co|inc|llc|ltd|company)\b\.?/giu, ""));

/**
 * Playbook section 06 "Post-event social post" caption: venue × company,
 * one line about the event, the dish guests loved, then the venue tag and
 * hashtags. Missing facts are left out, never shown as blanks.
 */
export function socialPostText(input: {
  venueName: string;
  companyName: string;
  guestCount?: number | null;
  occasion?: string | null;
  dish: string;
  socialHandle?: string | null;
  city?: string | null;
  eventType?: string | null;
}): string {
  const occasion = (input.occasion ?? "").trim();
  const guests =
    input.guestCount && input.guestCount > 0
      ? `${input.guestCount} guests`
      : "";
  const about = occasion
    ? `${occasion}${guests ? ` with ${guests}` : ""}`
    : guests
      ? `An event with ${guests}`
      : "";
  const dish = input.dish.trim();
  const handle = (input.socialHandle ?? "").trim().replace(/^@+/u, "");
  const cityTag = hashtag(input.city ?? "");
  const tags = [
    handle ? `@${handle}` : "",
    companyTag(input.companyName),
    cityTag ? `${cityTag}Events` : "",
    hashtag(input.eventType ?? ""),
  ].filter(Boolean);
  return [
    input.companyName.trim()
      ? `${input.venueName} × ${input.companyName.trim()}`
      : `What a night at ${input.venueName}!`,
    about ? sentence(about) : "",
    dish ? `Guests loved the ${dish.replace(/[.!]+$/u, "")}.` : "",
    tags.join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const CLIENT_QUESTIONS = [
  ["space", "How was the venue space for your event?"],
  ["food", "Was the food presentation what you pictured for the space?"],
  ["recommend", "Would you recommend this venue and us to a friend?"],
  ["improve", "Anything we could do better at this venue next time?"],
] as const;
export type ClientAnswerKey = (typeof CLIENT_QUESTIONS)[number][0];

/** The short feedback request sent to the client. */
export function clientFeedbackRequest(input: {
  clientName?: string | null;
  venueName: string;
  repName: string;
}): string {
  const name = firstName(input.clientName);
  return [
    `Hi${name ? ` ${name}` : ""}, thank you for having us at ${input.venueName}! Could you answer a few quick questions?`,
    ...CLIENT_QUESTIONS.map(
      ([, question], index) => `${index + 1}. ${question}`,
    ),
    `Thank you!${input.repName ? ` - ${input.repName}` : ""}`,
  ].join("\n");
}

/** The client's answers as one venue note; empty when nothing was given. */
export function clientFeedbackNote(input: {
  rating?: number | null;
  answers: Partial<Record<ClientAnswerKey, string>>;
}): string {
  return [
    input.rating != null ? `Score: ${input.rating}/10` : "",
    ...CLIENT_QUESTIONS.map(([key, question]) => {
      const answer = (input.answers[key] ?? "").trim();
      return answer ? `${question} ${answer}` : "";
    }),
  ]
    .filter(Boolean)
    .join("\n");
}

export const DEBRIEF_FIELDS = [
  ["well", "What went well"],
  ["wrong", "What went wrong"],
  ["venue", "Venue problems (load-in, power, venue staff)"],
  ["client", "Problems the client saw"],
  ["damage", "Damage or loss"],
] as const;
export type DebriefKey = (typeof DEBRIEF_FIELDS)[number][0];

/** The debrief as one venue note; empty when nothing was written. */
export function debriefNote(
  answers: Partial<Record<DebriefKey, string>>,
): string {
  return DEBRIEF_FIELDS.map(([key, label]) => {
    const answer = (answers[key] ?? "").trim();
    return answer ? `${label}: ${answer}` : "";
  })
    .filter(Boolean)
    .join("\n");
}
