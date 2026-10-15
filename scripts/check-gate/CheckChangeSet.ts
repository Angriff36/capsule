import { spawnSync } from "node:child_process";

/** Files that changed since the release base, or "unproven" if we cannot tell. */
export class CheckChangeSet {
  readonly proven: boolean;
  readonly base: string;
  readonly paths: ReadonlySet<string>;
  readonly storyDirectories: ReadonlySet<string>;
  readonly whyUnproven: string;

  private constructor(
    proven: boolean,
    base: string,
    paths: ReadonlySet<string>,
    storyDirectories: ReadonlySet<string>,
    whyUnproven: string,
  ) {
    this.proven = proven;
    this.base = base;
    this.paths = paths;
    this.storyDirectories = storyDirectories;
    this.whyUnproven = whyUnproven;
  }

  static load(root: string): CheckChangeSet {
    const stories = storyDirectories(root);
    if (process.env.CAPSULE_CHECK_FULL === "1") {
      return new CheckChangeSet(
        false,
        "",
        new Set(),
        stories,
        "CAPSULE_CHECK_FULL=1",
      );
    }
    const head = option("--head");
    const requestedBase = option("--base");
    const base =
      requestedBase ??
      git(root, ["merge-base", "origin/main", head ?? "HEAD"])?.trim() ??
      "";
    const baseSha = base
      ? git(root, ["rev-parse", "--verify", `${base}^{commit}`])?.trim()
      : "";
    if (!baseSha) {
      return new CheckChangeSet(
        false,
        base,
        new Set(),
        stories,
        "no release base (origin/main is missing)",
      );
    }
    const range = head ? [baseSha, head] : [baseSha];
    const paths = new Set(
      (git(root, ["diff", "--name-only", "--no-renames", ...range]) ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );
    if (!head) {
      for (const path of (
        git(root, ["ls-files", "--others", "--exclude-standard"]) ?? ""
      )
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)) {
        paths.add(path);
      }
    }
    return new CheckChangeSet(true, baseSha, paths, stories, "");
  }

  /** True when a specialized check must run. Unproven change sets always run. */
  touches(isRelevant: (path: string) => boolean): boolean {
    if (!this.proven) return true;
    for (const path of this.paths) {
      if (isRelevant(path)) return true;
    }
    return false;
  }
}

function option(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

function git(root: string, args: string[]): string | null {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return result.status === 0 ? result.stdout : null;
}

function storyDirectories(root: string): Set<string> {
  const blobs = [
    git(root, ["ls-files", "-z"]) ?? "",
    git(root, ["ls-files", "-z", "--others", "--exclude-standard"]) ?? "",
  ];
  const dirs = new Set<string>();
  for (const blob of blobs) {
    for (const entry of blob.split("\0")) {
      if (!/\.stories\.[cm]?[jt]sx?$/.test(entry)) continue;
      const posix = entry.replace(/\\/g, "/");
      const slash = posix.lastIndexOf("/");
      if (slash > 0) dirs.add(posix.slice(0, slash));
    }
  }
  return dirs;
}
