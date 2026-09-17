import { describe, expect, it } from "vitest";
import { clerkSignedInLabel } from "../src/features/staff/MyDayIdentityResolver";

describe("My Day signed-in identity paint", () => {
  it("clerkSignedInLabel uses Clerk fullName / email, never a Person leftover", () => {
    expect(
      clerkSignedInLabel({
        firstName: "Angriff",
        lastName: null,
        fullName: "Angriff",
        email: "angriff@example.com",
      }),
    ).toBe("Angriff");
    expect(
      clerkSignedInLabel({
        firstName: null,
        lastName: null,
        fullName: null,
        email: "angriff@example.com",
      }),
    ).toBe("angriff@example.com");
    expect(clerkSignedInLabel(null)).toBe("");
  });
});
