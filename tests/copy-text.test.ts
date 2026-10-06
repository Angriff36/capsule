// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { copyText } from "../src/lib/copyText";

afterEach(() => vi.unstubAllGlobals());

it("says it copied only when the browser copied", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  await expect(copyText("https://example.test/a")).resolves.toBe(true);
  expect(writeText).toHaveBeenCalledWith("https://example.test/a");
});

it("returns false instead of throwing when the browser refuses", async () => {
  const writeText = vi
    .fn()
    .mockRejectedValue(new Error("Write permission denied."));
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  await expect(copyText("text")).resolves.toBe(false);
});
