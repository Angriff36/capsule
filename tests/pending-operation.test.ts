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
  it("preserves the operation key while retrying current operator input", () => {
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
    expect(retry.key).toBe(first.key);
    expect(retry.payload).toEqual(payloadB);
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
    const first = beginPendingOperation("pack:2", payloadA, {
      storage,
      randomUUID: () => "fallback",
    });
    expect(first.key).toBe("pack:2:storage-unavailable");
    resetPendingOperationsForTest();
    expect(beginPendingOperation("pack:2", payloadB, { storage }).key).toBe(
      first.key,
    );
    expect(
      beginPendingOperation("pack:2", payloadB, {
        storage,
        randomUUID: () => "unused",
      }).payload,
    ).toEqual(payloadB);
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
    resetPendingOperationsForTest();
    const afterRefresh = beginPendingOperation("pack:3", payloadB, {
      storage,
      randomUUID: () => "ignored",
    });
    expect(afterRefresh).toEqual({ key: "old", payload: payloadB });
  });

  it("survives the window.localStorage property getter throwing", () => {
    const originalWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      "window",
    );
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.defineProperty({}, "localStorage", {
        get() {
          throw new Error("storage getter denied");
        },
      }),
    });
    try {
      const pending = beginPendingOperation("pack:getter", payloadA, {
        randomUUID: () => "unused",
      });
      expect(pending.key).toBe("pack:getter:storage-unavailable");
      expect(() => confirmPendingOperation("pack:getter")).not.toThrow();
    } finally {
      if (originalWindow)
        Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
});
