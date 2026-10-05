/**
 * Proof: after-event follow-up at a partner venue (Venue Partner Playbook
 * section 13) - due times, done/late state, message texts, and the client
 * score and last-30-days list on the partner scorecard.
 */
import { describe, expect, it } from "vitest";
import {
  clientFeedbackNote,
  clientFeedbackRequest,
  debriefNote,
  followUpApplies,
  followUpSteps,
  thankYouText,
} from "../../src/features/events/venueFollowUp";
import { partnerScorecard } from "../../src/features/facilities/venuePartnership";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("venue follow-up", () => {
  const ended = Date.UTC(2026, 9, 3, 22);

  it("shows only once an event has started at a partner venue", () => {
    const now = ended + HOUR;
    expect(
      followUpApplies({
        partnerTier: "full_event",
        stage: "booked",
        startsAt: ended - 4 * HOUR,
        now,
      }),
    ).toBe(true);
    expect(
      followUpApplies({
        partnerTier: null,
        stage: "booked",
        startsAt: ended - 4 * HOUR,
        now,
      }),
    ).toBe(false);
    expect(
      followUpApplies({
        partnerTier: "full_event",
        stage: "booked",
        startsAt: now + DAY,
        now,
      }),
    ).toBe(false);
    expect(
      followUpApplies({
        partnerTier: "full_event",
        stage: "cancelled",
        startsAt: ended,
        now,
      }),
    ).toBe(false);
    // Marked completed counts even when the date is still ahead.
    expect(
      followUpApplies({
        partnerTier: "full_event",
        stage: "completed",
        startsAt: now + DAY,
        now,
      }),
    ).toBe(true);
  });

  it("thank-you due in 24h, debrief 48h, client feedback 72h; done by this event's note; late is only a label", () => {
    const steps = followUpSteps({
      venueId: "v1",
      eventId: "e1",
      endedAt: ended,
      now: ended + 30 * HOUR,
      notes: [
        {
          venueId: "v1",
          eventId: "e1",
          category: "debrief",
          content: "What went well: all",
          postedAt: ended + 2 * HOUR,
        },
        // Another event's thank-you does not count for this one.
        {
          venueId: "v1",
          eventId: "e2",
          category: "thank_you",
          postedAt: ended + HOUR,
        },
        // A removed note does not count.
        {
          venueId: "v1",
          eventId: "e1",
          category: "client_feedback",
          postedAt: ended + HOUR,
          deletedAt: ended + 2 * HOUR,
        },
      ],
    });
    const byKind = Object.fromEntries(steps.map((step) => [step.kind, step]));
    expect(byKind.thank_you!.dueAt).toBe(ended + 24 * HOUR);
    expect(byKind.thank_you!.done).toBeNull();
    expect(byKind.thank_you!.late).toBe(true);
    expect(byKind.debrief!.done?.content).toBe("What went well: all");
    expect(byKind.debrief!.late).toBe(false);
    expect(byKind.client_feedback!.dueAt).toBe(ended + 72 * HOUR);
    expect(byKind.client_feedback!.done).toBeNull();
    expect(byKind.client_feedback!.late).toBe(false);
  });

  it("writes the playbook texts", () => {
    expect(
      thankYouText({
        contactName: "Sarah Kindred",
        venueName: "Kindred + Co.",
        highlight: "The grazing table went perfectly",
        issue: "",
        repName: "Kayden",
      }),
    ).toBe(
      "Hey Sarah, just wanted to say thanks for another great event at Kindred + Co. The grazing table went perfectly. Hope you have a great rest of your week! - Kayden",
    );
    expect(
      thankYouText({
        venueName: "SEL",
        highlight: "",
        issue: "late load-in",
        repName: "",
      }),
    ).toContain("One thing I wanted to flag: late load-in.");
    const request = clientFeedbackRequest({
      clientName: "Ashley Ewing",
      venueName: "SEL",
      repName: "Tim",
    });
    expect(request).toContain("Hi Ashley");
    expect(request).toContain("1. How was the venue space for your event?");
    expect(request).toContain(
      "4. Anything we could do better at this venue next time?",
    );
  });

  it("builds the saved notes, leaving blank answers out", () => {
    expect(
      clientFeedbackNote({
        rating: 9,
        answers: { space: "Lovely", improve: " " },
      }),
    ).toBe("Score: 9/10\nHow was the venue space for your event? Lovely");
    expect(clientFeedbackNote({ answers: {} })).toBe("");
    expect(
      debriefNote({ well: "Fast service", damage: "Chipped chafer" }),
    ).toBe("What went well: Fast service\nDamage or loss: Chipped chafer");
    expect(debriefNote({})).toBe("");
  });

  it("scorecard: thank-you counts as contact; client score averages the year; last 30 days lists feedback, debriefs and problems", () => {
    const now = ended + 2 * DAY;
    const card = partnerScorecard({
      venue: { _id: "v1", opsEaseScore: 8, relationshipScore: 8 },
      events: [
        {
          venueId: "v1",
          stage: "booked",
          startsAt: ended - 5 * HOUR,
          quotedPrice: 5000,
        },
      ],
      notes: [
        { venueId: "v1", category: "thank_you", postedAt: ended + HOUR },
        {
          venueId: "v1",
          category: "client_feedback",
          rating: 9,
          content: "Score: 9/10",
          postedAt: ended + DAY,
        },
        {
          venueId: "v1",
          category: "client_feedback",
          rating: 6,
          postedAt: now - 200 * DAY,
        },
        {
          venueId: "v1",
          category: "client_feedback",
          rating: 1,
          postedAt: now - 400 * DAY,
        },
        {
          venueId: "v1",
          category: "debrief",
          content: "Power tripped",
          postedAt: ended + 3 * HOUR,
        },
        { venueId: "v1", category: "check_in", postedAt: now - 40 * DAY },
      ],
      referralSources: [],
      leads: [],
      now,
    });
    expect(card.lastContactAt).toBe(ended + HOUR);
    expect(card.contactOverdue).toBe(false);
    expect(card.clientSatisfaction).toBe(7.5);
    expect(card.eventsLast30Days).toBe(1);
    expect(card.lastMonth.map((note) => note.category)).toEqual([
      "client_feedback",
      "debrief",
    ]);
  });
});
