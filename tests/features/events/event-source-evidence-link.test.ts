import { describe, expect, it } from "vitest";
import { eventSourceEvidenceKey } from "../../../src/features/events/eventSourceEvidenceLink";

describe("eventSourceEvidenceKey", () => {
  it("prints the stored key over a later live file name", () => {
    expect(
      eventSourceEvidenceKey({
        storedKey: "beo-worksheet-v1",
        liveFileName: "worksheet-RENAMED.pdf",
      }),
    ).toBe("beo-worksheet-v1");
  });

  it("still returns the stored key when no live file name is given", () => {
    expect(eventSourceEvidenceKey({ storedKey: "beo-worksheet-v1" })).toBe(
      "beo-worksheet-v1",
    );
  });

  it("never invents a stored key from the live file name", () => {
    expect(
      eventSourceEvidenceKey({
        storedKey: null,
        liveFileName: "worksheet.pdf",
      }),
    ).toBeNull();
  });

  it("returns null for a missing stored key", () => {
    expect(eventSourceEvidenceKey({ storedKey: null })).toBeNull();
  });

  it("returns null for undefined / empty input", () => {
    expect(eventSourceEvidenceKey({ storedKey: undefined })).toBeNull();
    expect(eventSourceEvidenceKey({})).toBeNull();
  });

  it("returns null for a whitespace-only stored key", () => {
    expect(
      eventSourceEvidenceKey({
        storedKey: "   ",
        liveFileName: "worksheet.pdf",
      }),
    ).toBeNull();
  });
});
