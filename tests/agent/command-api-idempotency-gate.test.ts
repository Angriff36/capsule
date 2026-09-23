/**
 * Unit proof for the command-API idempotency gate: which calls are retryable
 * external commands, where the key comes from, and how it lands on the body.
 */
import { describe, expect, it } from "vitest";
import { commandApiIdempotencyGate as gate } from "../../src/agent/CommandApiIdempotencyGate";

describe("command API idempotency gate", () => {
  it("treats POST entity command paths as retryable external calls", () => {
    expect(
      gate.isRetryableExternalCommand(
        "POST",
        "/api/manifest/Client/commands/register",
      ),
    ).toBe(true);
    expect(
      gate.isRetryableExternalCommand(
        "POST",
        "/api/manifest/Client/commands/register/",
      ),
    ).toBe(true);
    expect(
      gate.isRetryableExternalCommand(
        "GET",
        "/api/manifest/Client/commands/register",
      ),
    ).toBe(false);
    expect(
      gate.isRetryableExternalCommand("POST", "/api/manifest/commands"),
    ).toBe(false);
  });

  it("reads a header key or a body key and ignores blanks", () => {
    const headers = (value?: string) => {
      const h = new Headers();
      if (value !== undefined) h.set("Idempotency-Key", value);
      return h;
    };
    // Header wins over body.
    expect(
      gate.readKey(
        headers("abc"),
        JSON.stringify({ idempotencyKey: "from-body" }),
      ),
    ).toBe("abc");
    // Body key works with no header.
    expect(
      gate.readKey(headers(), JSON.stringify({ idempotencyKey: "from-body" })),
    ).toBe("from-body");
    // Blank header and missing body field → null.
    expect(
      gate.readKey(headers("   "), JSON.stringify({ clientType: "company" })),
    ).toBe(null);
    // Unparseable body → null.
    expect(gate.readKey(headers(), "{not json")).toBe(null);
  });

  it("writes the key onto a JSON object body", () => {
    expect(JSON.parse(gate.applyToBody(JSON.stringify({ a: 1 }), "k"))).toEqual(
      {
        a: 1,
        idempotencyKey: "k",
      },
    );
    expect(JSON.parse(gate.applyToBody("", "k"))).toEqual({
      idempotencyKey: "k",
    });
  });
});
