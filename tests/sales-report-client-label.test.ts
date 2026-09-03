import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clientDisplayName } from "../src/features/events/clientName";

const client = (fields: Record<string, unknown> = {}) => ({
  _id: "client-1",
  clientType: "person",
  ...fields,
});

describe("sales report client labels", () => {
  it("renders both names through the production client label helper", () => {
    expect(
      clientDisplayName("client-1", [
        client({ givenName: "Ada", familyName: "Lovelace" }) as never,
      ]),
    ).toBe("Ada Lovelace");
  });

  it("renders first-only and last-only names without extra spaces", () => {
    expect(
      clientDisplayName("client-1", [
        client({ givenName: "Ada", familyName: null }) as never,
      ]),
    ).toBe("Ada");
    expect(
      clientDisplayName("client-1", [
        client({ givenName: null, familyName: "Lovelace" }) as never,
      ]),
    ).toBe("Lovelace");
  });

  it.each([undefined, null, "", "   "])(
    "uses the safe fallback when both names are %p",
    (value) => {
      const label = clientDisplayName("client-1", [
        client({ givenName: value, familyName: value }) as never,
      ]);
      expect(label).toBe("—");
      expect(label).not.toContain("undefined");
    },
  );

  it("wires Top Clients to the production helper and rejects the old interpolation", () => {
    const page = readFileSync(
      "src/features/reports/SalesDashboardPage.tsx",
      "utf8",
    );
    expect(page).toContain("clientDisplayName(event.clientId, clients)");
    expect(page).not.toContain("contactGivenName");
    expect(page).not.toContain("contactFamilyName");
    expect(clientDisplayName("client-1", [client() as never])).not.toBe(
      "undefined undefined",
    );
  });
});
