export type ActionResultKind = "ok" | "fail";

/** A record the action made or changed, shown as a link on the result. */
export type ActionResultLink = { label: string; href: string };

export type ActionResult = {
  id: number;
  kind: ActionResultKind;
  message: string;
  links?: readonly ActionResultLink[];
};

type Listener = (result: ActionResult | null) => void;

const OK_DISMISS_MS = 8000;
const FAIL_DISMISS_MS = 14000;

/**
 * Singleton that holds the last action result so the shell can show it
 * above the scrolling workspace. Pages report here instead of hoping the
 * operator is still looking at an inline banner.
 */
export class ActionResultStore {
  static readonly shared = new ActionResultStore();

  private result: ActionResult | null = null;
  private readonly listeners = new Set<Listener>();
  private nextId = 1;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.result);
    return () => {
      this.listeners.delete(listener);
    };
  }

  current(): ActionResult | null {
    return this.result;
  }

  ok(message: string, links?: readonly ActionResultLink[]): void {
    this.publish(message.trim(), "ok", OK_DISMISS_MS, links);
  }

  fail(message: string): void {
    this.publish(message.trim(), "fail", FAIL_DISMISS_MS);
  }

  dismiss(): void {
    this.clearTimer();
    this.result = null;
    this.emit();
  }

  private publish(
    message: string,
    kind: ActionResultKind,
    dismissMs: number,
    links?: readonly ActionResultLink[],
  ): void {
    if (!message) return;
    this.clearTimer();
    this.result = {
      id: this.nextId++,
      kind,
      message,
      ...(links?.length ? { links } : {}),
    };
    this.emit();
    const publishedId = this.result.id;
    this.dismissTimer = setTimeout(() => {
      if (this.result?.id === publishedId) this.dismiss();
    }, dismissMs);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.result);
  }

  private clearTimer(): void {
    if (this.dismissTimer != null) clearTimeout(this.dismissTimer);
    this.dismissTimer = null;
  }
}

export function reportActionOk(
  message: string,
  links?: readonly ActionResultLink[],
): void {
  ActionResultStore.shared.ok(message, links);
}

export function reportActionFail(message: string): void {
  ActionResultStore.shared.fail(message);
}

export function dismissActionResult(): void {
  ActionResultStore.shared.dismiss();
}
