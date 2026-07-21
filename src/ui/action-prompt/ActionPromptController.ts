import type {
  ActionPromptRequest,
  ActionPromptResult,
} from "./ActionPromptTypes";

type PendingPrompt = {
  request: ActionPromptRequest;
  resolve: (result: ActionPromptResult) => void;
};

type Listener = (pending: PendingPrompt | null) => void;

/** Promise-based in-page replacement for window.prompt / window.confirm. */
export class ActionPromptController {
  private pending: PendingPrompt | null = null;
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.pending);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getPending(): PendingPrompt | null {
    return this.pending;
  }

  ask(request: ActionPromptRequest): Promise<ActionPromptResult> {
    if (this.pending) {
      this.pending.resolve({ status: "dismissed" });
    }
    return new Promise((resolve) => {
      this.pending = { request, resolve };
      this.emit();
    });
  }

  confirm(result: ActionPromptResult): void {
    const current = this.pending;
    if (!current) return;
    this.pending = null;
    this.emit();
    current.resolve(result);
  }

  dismiss(): void {
    this.confirm({ status: "dismissed" });
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.pending);
  }
}
