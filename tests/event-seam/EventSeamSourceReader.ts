import { readFileSync } from "node:fs";
import path from "node:path";

/** Loads repository source once for Event seam contract proofs. */
export class EventSeamSourceReader {
  readonly root = process.cwd();

  read(relativePath: string): string {
    return readFileSync(path.join(this.root, relativePath), "utf8");
  }

  sliceBetween(source: string, startMarker: string, endMarker: string): string {
    const start = source.indexOf(startMarker);
    if (start < 0) {
      throw new Error(`Missing start marker: ${startMarker}`);
    }
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (end < 0) {
      throw new Error(`Missing end marker after ${startMarker}: ${endMarker}`);
    }
    return source.slice(start, end);
  }
}
