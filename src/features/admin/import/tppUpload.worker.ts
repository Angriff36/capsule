import {
  indexTppFile,
  orderedTppCollections,
  readTppBatch,
  digestHex,
  TPP_BATCH_BYTES,
  type TppFileIndex,
} from "../../../lib/tppAccountFile";
import { inferTppFilePackages } from "../../../lib/tppPackageImport";
let file: File;
let index: TppFileIndex;
const pending = new Map<number, number>();
let wake: (() => void) | undefined;
const waitForCapacity = () =>
  new Promise<void>((resolve) => {
    wake = resolve;
  });
const send = (value: unknown) => self.postMessage(value);
setInterval(() => send({ type: "heartbeat" }), 5000);
async function upload(resumePart: number, received: number[] = []) {
  const saved = new Set(received);
  let sequence = 0;
  async function emit(collection: string, blob: Blob) {
    if (sequence >= resumePart && !saved.has(sequence)) {
      // Keep the uplink busy without retaining an unbounded number of blobs.
      while (
        pending.size >= 12 ||
        (pending.size &&
          [...pending.values()].reduce((a, b) => a + b, 0) + blob.size >
            48 * 1024 * 1024)
      )
        await waitForCapacity();
      const checksum = await digestHex(await blob.arrayBuffer());
      pending.set(sequence, blob.size);
      send({ type: "part", sequence, collection, blob, checksum });
    }
    sequence++;
  }
  for (const collection of orderedTppCollections(index)) {
    send({ type: "preparing", collection, sequence });
    if (collection === "eventInventoryItems") {
      const { packages } = await inferTppFilePackages(file, index);
      // One package per receipt bounds writes and preserves deterministic resume.
      for (const pkg of packages)
        await emit(
          "__packages_v1",
          new Blob([JSON.stringify([pkg])], { type: "application/json" }),
        );
    }
    const offsets = index.collections[collection];
    let ranges: [number, number][] = [],
      size = 0;
    const flush = async () => {
      if (ranges.length) {
        if (sequence < resumePart || saved.has(sequence)) sequence++;
        else {
          const rows = await readTppBatch(file, ranges);
          await emit(
            collection,
            new Blob([JSON.stringify(rows)], { type: "application/json" }),
          );
        }
        ranges = [];
        size = 0;
      }
    };
    for (let i = 0; i < offsets.length; i += 2) {
      const bytes = offsets[i + 1] - offsets[i];
      if (
        ranges.length &&
        (ranges.length >= 100 || size + bytes > TPP_BATCH_BYTES)
      )
        await flush();
      ranges.push([offsets[i], offsets[i + 1]]);
      size += bytes;
      if (size >= TPP_BATCH_BYTES) await flush();
    }
    await flush();
  }
  // Preserve extraction provenance too, in bounded verbatim pieces.
  for (
    let offset = index.provenanceStart;
    offset < file.size;
    offset += 4 * 1024 * 1024
  )
    await emit("__provenance", file.slice(offset, offset + 4 * 1024 * 1024));
  while (pending.size) await waitForCapacity();
  send({ type: "done", parts: sequence });
}
self.onmessage = async (event: MessageEvent) => {
  try {
    if (event.data.type === "ack") {
      pending.delete(event.data.sequence);
      const done = wake;
      wake = undefined;
      done?.();
      return;
    }
    if (event.data.type === "index") {
      file = event.data.file;
      index = await indexTppFile(file, (bytes) =>
        send({ type: "indexing", bytes }),
      );
      send({
        type: "ready",
        metadata: index.metadata,
        fingerprint: index.fingerprint,
        rows: index.rows,
        collections: Object.fromEntries(
          Object.entries(index.collections).map(([name, offsets]) => [
            name,
            offsets.length / 2,
          ]),
        ),
      });
    } else if (event.data.type === "upload")
      await upload(event.data.resumePart, event.data.received);
  } catch (error) {
    send({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
};
