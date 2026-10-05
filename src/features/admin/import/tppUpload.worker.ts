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
let acknowledge: (() => void) | undefined;
const send = (value: unknown) => self.postMessage(value);
setInterval(() => send({ type: "heartbeat" }), 5000);
async function upload(resumePart: number) {
  let sequence = 0;
  async function emit(collection: string, blob: Blob) {
    if (sequence >= resumePart) {
      const checksum = await digestHex(await blob.arrayBuffer());
      const waiting = new Promise<void>((resolve) => {
        acknowledge = resolve;
      });
      send({ type: "part", sequence, collection, blob, checksum });
      await waiting;
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
        if (sequence < resumePart) sequence++;
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
  send({ type: "done", parts: sequence });
}
self.onmessage = async (event: MessageEvent) => {
  try {
    if (event.data.type === "ack") {
      const done = acknowledge;
      acknowledge = undefined;
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
      await upload(event.data.resumePart);
  } catch (error) {
    send({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
};
