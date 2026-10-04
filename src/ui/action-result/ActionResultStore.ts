export type ActionResultKind = "ok" | "fail";

export type ActionResultAction = {
  label: string;
  to: string;
};

export type ActionResult = {
  id: number;
  kind: ActionResultKind;
  message: string;
  actions?: readonly ActionResultAction[];
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

  ok(message: string, actions?: readonly ActionResultAction[]): void {
    this.publish(message.trim(), "ok", OK_DISMISS_MS, actions);
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
    actions?: readonly ActionResultAction[],
  ): void {
    if (!message) return;
    this.clearTimer();
    this.result = { id: this.nextId++, kind, message, actions };
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
  actions?: readonly ActionResultAction[],
): void {
  ActionResultStore.shared.ok(message, actions);
}

export function reportActionFail(message: string): void {
  ActionResultStore.shared.fail(message);
}

export function dismissActionResult(): void {
  ActionResultStore.shared.dismiss();
}
