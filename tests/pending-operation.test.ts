import { beforeEach, describe, expect, it } from "vitest";
import {
  beginPendingOperation,
  confirmPendingOperation,
  resetPendingOperationsForTest,
} from "../src/lib/pendingOperationKey";

const payloadA = { items: [{ description: "A" }, { description: "B" }] };
const payloadB = {
  items: [{ description: "C" }, { description: "A" }, { description: "B" }],
};

beforeEach(() => resetPendingOperationsForTest());

describe("pending operation payload", () => {
  it("replays the frozen request when live source data changes", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const first = beginPendingOperation("pack:1", payloadA, {
      storage,
      randomUUID: () => "one",
    });
    const retry = beginPendingOperation("pack:1", payloadB, {
      storage,
      randomUUID: () => "two",
    });
    expect(retry).toEqual(first);
    expect(retry.payload).toEqual(payloadA);
  });

  it("continues safely when storage fails before submission", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() =>
      beginPendingOperation("pack:2", payloadA, {
        storage,
        randomUUID: () => "fallback",
      }),
    ).not.toThrow();
    expect(
      beginPendingOperation("pack:2", payloadB, {
        storage,
        randomUUID: () => "unused",
      }).payload,
    ).toEqual(payloadA);
  });

  it("does not turn confirmed backend success into failure when cleanup throws", () => {
    const storage = {
      getItem: () => JSON.stringify({ key: "old", payload: payloadA }),
      setItem: () => undefined,
      removeItem: () => {
        throw new Error("blocked cleanup");
      },
    };
    expect(() => confirmPendingOperation("pack:3", storage)).not.toThrow();
    const next = beginPendingOperation("pack:3", payloadB, {
      storage,
      randomUUID: () => "new",
    });
    expect(next).toEqual({ key: "pack:3:new", payload: payloadB });
  });
});
