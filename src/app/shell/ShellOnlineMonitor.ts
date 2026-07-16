/** Tracks browser online/offline for the shell offline banner. */
export class ShellOnlineMonitor {
  private online = typeof navigator !== "undefined" ? navigator.onLine : true;
  private readonly listeners = new Set<(online: boolean) => void>();

  start(): () => void {
    if (typeof window === "undefined") return () => undefined;
    const up = () => this.setOnline(true);
    const down = () => this.setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }

  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    listener(this.online);
    return () => {
      this.listeners.delete(listener);
    };
  }

  isOnline(): boolean {
    return this.online;
  }

  private setOnline(value: boolean): void {
    this.online = value;
    for (const listener of this.listeners) listener(value);
  }
}
