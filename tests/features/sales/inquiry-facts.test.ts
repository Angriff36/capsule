import { describe, expect, it } from "vitest";
import {
  readInquiryFacts,
  senderName,
} from "../../../src/features/sales/inquiryFacts";

const NOW = new Date("2026-10-07T09:00:00");
const day = (ms: number | undefined) =>
  ms == null ? null : new Date(ms).toDateString();

describe("an inquiry's own words become lead facts", () => {
  it("reads guests and a date", () => {
    const facts = readInquiryFacts(
      "We need lunch for 40 people on Nov 12 at our office.",
      NOW,
    );
    expect(facts.guestCount).toBe(40);
    expect(day(facts.eventDate)).toBe("Thu Nov 12 2026");
  });

  it("reads a full month name with a day ending and a year", () => {
    const facts = readInquiryFacts(
      "Wedding on August 3rd, 2027 for about 120 guests",
      NOW,
    );
    expect(facts.guestCount).toBe(120);
    expect(day(facts.eventDate)).toBe("Tue Aug 03 2027");
  });

  it("leaves out what the message does not say", () => {
    expect(readInquiryFacts("Can you cater?", NOW)).toEqual({});
  });

  it("makes a readable name from the sender", () => {
    expect(senderName("maria.lopez@events.test")).toBe("Maria Lopez");
    expect(senderName("@hannah.okafor.weds")).toBe("hannah.okafor.weds");
    expect(senderName("509 555 0101")).toBe("509 555 0101");
  });

  it("reads a bare count after 'for' but not money, times or days", () => {
    const say = (text: string) => readInquiryFacts(text, NOW).guestCount;
    expect(say("We need lunch for 35 on Nov 20 at our office.")).toBe(35);
    expect(say("Dinner, a party of 12, next month")).toBe(12);
    expect(say("Budget is $20 for 2 hours")).toBeUndefined();
    expect(say("Can you hold it for 3 days?")).toBeUndefined();
    expect(say("Start for 5pm please")).toBeUndefined();
    expect(say("Lunch for 40 people for 2 hours")).toBe(40);
  });
});
