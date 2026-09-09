import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clerkSignedInLabel } from "../src/features/staff/MyDayIdentityResolver";

describe("My Day signed-in identity paint", () => {
  const pageSource = readFileSync("src/features/staff/MyDayPage.tsx", "utf8");
  const frameSource = readFileSync("src/features/staff/MyDayFrame.tsx", "utf8");

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

  it("chip and PageHeader cannot omit the signed-in Clerk name", () => {
    expect(pageSource).toMatch(/signedInName=\{clerkDisplayName/);
    expect(pageSource).toMatch(/clerkDisplayName = clerkSignedInLabel/);
    expect(pageSource).toMatch(
      /<MyDayFrame\s+signedInName=\{clerkDisplayName \|\| undefined\}/,
    );
    expect(frameSource).toMatch(/signedInName\?: string/);
    expect(frameSource).toMatch(/signedInName &&/);
    expect(frameSource).toMatch(/signedInName \?\? "My Day"/);
    expect(frameSource).toMatch(/identityLead = signedInName/);
    expect(frameSource).toMatch(/lead=\{identityLead\}/);
    expect(pageSource).not.toMatch(
      /subtitle=\{`\$\{me\.givenName\} \$\{me\.familyName\}`\}/,
    );
  });

  it("bound view uses server identity without an unlinked Switch fallback", () => {
    expect(pageSource).not.toMatch(/onSwitchPerson=/);
    expect(pageSource).toMatch(/resolveMyDayAccount\(/);
    expect(pageSource).toMatch(/linkedPersonName=\{linkedPersonName\}/);
    expect(pageSource).toMatch(/md:grid-cols-2/);
  });

  it("does not auto-store a person id on load", () => {
    expect(pageSource).not.toMatch(/storePersonId|readStoredPersonId/);
  });

  it("wide two-column layout stays on the bound frame", () => {
    expect(pageSource).toMatch(/<MyDayFrame\s+wide\s+signedInName=/);
    expect(frameSource).toMatch(/wide \? "max-w-md md:max-w-5xl"/);
  });
});
