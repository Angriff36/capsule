const STORAGE_KEY = "capsule:list-scroll";
const memory = new Map<string, number>();

/** Persists entry-specific offsets and applies only the currently possible amount. */
export class ListScrollManager {
  read(key: string) {
    const fallback = memory.get(key) ?? 0;
    try {
      const value = Number(sessionStorage.getItem(`${STORAGE_KEY}:${key}`));
      return Number.isFinite(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }
  write(key: string, value: number) {
    memory.set(key, value);
    try {
      sessionStorage.setItem(`${STORAGE_KEY}:${key}`, String(value));
    } catch {
      /* unavailable storage */
    }
  }
  restore(node: HTMLElement, target: number) {
    const maximum = Math.max(0, node.scrollHeight - node.clientHeight);
    const applied = Math.min(target, maximum);
    node.scrollTop = applied;
    return { applied, complete: maximum >= target };
  }
}
