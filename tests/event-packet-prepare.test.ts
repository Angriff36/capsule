import { describe, expect, it, vi } from "vitest";
import fixture from "../src/lib/eventPacket/fixtures/liberty-mutual-6837.snapshot.json";
import type { EventPacketSnapshot } from "../src/lib/eventPacket/model";
import { prepareNativeWorkbook } from "../src/lib/eventPacket/prepareNativeWorkbook";

describe("native workbook preparation", () => {
  const snapshot = fixture as EventPacketSnapshot;
  it("reuses the current immutable revision without rendering or uploading", async () => {
    const upload = vi.fn();
    const record = vi.fn();
    const result = await prepareNativeWorkbook({
      read: async () => ({
        snapshot,
        currentFingerprint: "current",
        latestRevision: { id: "r1", fingerprint: "current", stale: false },
      }),
      upload,
      record,
    });
    expect(result).toEqual({ revisionId: "r1", reused: true });
    expect(upload).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
  it("prints every open issue and records PDF and JSON against the exact server input", async () => {
    const files: { bytes: Uint8Array; purpose: string }[] = [];
    const record = vi.fn(async () => ({ id: "r2" }));
    const result = await prepareNativeWorkbook({
      read: async () => ({
        snapshot,
        currentFingerprint: "changed",
        latestRevision: { id: "r1", fingerprint: "old", stale: true },
      }),
      upload: async (file) => {
        files.push(file);
        return { storageId: file.purpose };
      },
      record,
    });
    expect(result).toEqual({ revisionId: "r2", reused: false });
    expect(new TextDecoder().decode(files[0].bytes.slice(0, 5))).toBe("%PDF-");
    expect(JSON.parse(new TextDecoder().decode(files[1].bytes))).toEqual(
      snapshot,
    );
    expect(record).toHaveBeenCalledWith({
      inputFingerprint: "changed",
      pdfStorageId: "pdf",
      snapshotStorageId: "snapshot",
    });
  });
  it("propagates a concurrent-change rejection and never reports a stale print as current", async () => {
    await expect(
      prepareNativeWorkbook({
        read: async () => ({
          snapshot,
          currentFingerprint: "old",
          latestRevision: null,
        }),
        upload: async () => ({ storageId: "uploaded" }),
        record: async () => {
          throw new Error("Event changed; prepare again");
        },
      }),
    ).rejects.toThrow("Event changed");
  });
});
