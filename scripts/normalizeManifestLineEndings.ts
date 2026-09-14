import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Builder hashes .manifest sources as bytes. CRLF vs LF is a false stale plan. */
export class ManifestLineEndingNormalizer {
  constructor(private readonly root: string) {}

  normalize(): number {
    let changed = 0;
    for (const file of this.walkManifests(join(this.root, "src"))) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("\r")) continue;
      writeFileSync(file, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
      changed += 1;
    }
    return changed;
  }

  private walkManifests(dir: string): string[] {
    let found: string[] = [];
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir);
    } catch {
      return found;
    }
    for (const name of entries) {
      const path = join(dir, name);
      let stat;
      try {
        stat = statSync(path);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        found = found.concat(this.walkManifests(path));
        continue;
      }
      if (name.endsWith(".manifest")) found.push(path);
    }
    return found;
  }
}
