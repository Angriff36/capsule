import { describe, expect, it, vi } from "vitest";
import fixture from "../src/lib/eventPacket/fixtures/liberty-mutual-6837.snapshot.json";
import type { EventPacketSnapshot } from "../src/lib/eventPacket/model";
import type { FinalLockPrint } from "../src/lib/eventPacket/finalLock/evaluate";
import { buildWorkbook } from "../src/lib/eventPacket/buildWorkbook";
import { parsePacketSnapshot } from "../src/lib/eventPacket/packetContract";
import { prepareNativeWorkbook } from "../src/lib/eventPacket/prepareNativeWorkbook";
import { renderWorkbook } from "../src/lib/eventPacket/renderWorkbook";
import { finalLockPageCount } from "../src/lib/eventPacket/finalLock/answersPage";
import { appendFinalLockPages } from "../src/lib/eventPacket/finalLock/pdfStamp";
import { extractPagesFromPdfDocument } from "../src/lib/pdf/extractPdfText";

describe("native workbook preparation", () => {
  const snapshot = fixture as EventPacketSnapshot;
  const finalLock: FinalLockPrint = {
    policyVersion: "final-lock-test",
    answers: { "setup.rain_plan": "fp-rain" },
    lines: [
      {
        questionKey: "setup.rain_plan",
        section: "layouts",
        label: "Rain plan",
        result: "answered",
        text: "Rain plan: move under the pavilion.",
      },
    ],
  };
  it("reuses the current immutable revision without rendering or uploading", async () => {
    const upload = vi.fn();
    const record = vi.fn();
    const result = await prepareNativeWorkbook({
      read: async () => ({
        snapshot,
        currentFingerprint: "current",
        finalLock,
        finalLockFingerprint: "lock",
        latestRevision: { id: "r1", fingerprint: "current", stale: false },
      }),
      upload,
      record,
    });
    expect(result).toEqual({ revisionId: "r1", reused: true });
    expect(upload).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
  it("prints every open issue and the Final Lock answers, and records PDF and JSON against the exact server input", async () => {
    const files: {
      bytes: Uint8Array;
      purpose: string;
      finalLockFingerprint?: string;
    }[] = [];
    const record = vi.fn(async () => ({ id: "r2" }));
    const result = await prepareNativeWorkbook({
      read: async () => ({
        snapshot,
        currentFingerprint: "changed",
        finalLock,
        finalLockFingerprint: "lock",
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
    expect(files[0].finalLockFingerprint).toBe("lock");
    // The snapshot file carries the exact answers the PDF shows.
    const uploaded = JSON.parse(new TextDecoder().decode(files[1].bytes));
    const { finalLock: printed, ...packet } = uploaded;
    expect(printed).toEqual(finalLock);
    expect(packet).toEqual(snapshot);
    // A printed snapshot file still reads back as a packet snapshot.
    expect(() => parsePacketSnapshot(uploaded)).not.toThrow();
    expect(record).toHaveBeenCalledWith({
      inputFingerprint: "changed",
      finalLockFingerprint: "lock",
      pdfStorageId: "pdf",
      snapshotStorageId: "snapshot",
    });
  });
  it("the server draws the Final Lock answer pages, and the workbook's page numbers count them", async () => {
    const workbook = buildWorkbook(snapshot, { finalLock: finalLock.lines });
    const rendered = await renderWorkbook(workbook);
    const extra = await finalLockPageCount(finalLock.lines);
    expect(extra).toBe(1);
    const stamped = await appendFinalLockPages(rendered.bytes, finalLock, {
      invoiceNumber: "6837",
      eventDate: "2026-10-10",
    });
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pages = await extractPagesFromPdfDocument(
      await getDocument({ data: stamped, disableFontFace: true }).promise,
    );
    const total = rendered.audit.mergedPageCount;
    expect(pages).toHaveLength(total);
    expect(pages[0]!.text).toContain(`/ ${total}`);
    const last = pages.at(-1)!.text;
    expect(last).toContain("Final Lock answers");
    expect(last).toContain("Rain plan: Rain plan: move under the pavilion.");
    expect(last).toContain(`Page ${total} / ${total}`);
  });
  it("propagates a concurrent-change rejection and never reports a stale print as current", async () => {
    await expect(
      prepareNativeWorkbook({
        read: async () => ({
          snapshot,
          currentFingerprint: "old",
          finalLock,
          finalLockFingerprint: "lock",
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
