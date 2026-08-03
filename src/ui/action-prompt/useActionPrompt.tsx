import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActionPromptController } from "./ActionPromptController";
import { ActionPromptPanel } from "./ActionPromptPanel";
import type {
  ActionPromptRequest,
  ActionPromptResult,
  ConfirmPromptRequest,
  FieldsPromptRequest,
  ReasonPromptRequest,
} from "./ActionPromptTypes";

const DISMISSED_NOTICE = "Cancelled — no changes were made.";

export class ActionPromptSession {
  constructor(
    private readonly controller: ActionPromptController,
    private readonly announceDismissed: () => void,
  ) {}

  ask(request: ActionPromptRequest): Promise<ActionPromptResult> {
    return this.controller.ask(request);
  }

  async askReason(
    request: Omit<ReasonPromptRequest, "kind">,
  ): Promise<string | null> {
    const result = await this.ask({ ...request, kind: "reason" });
    if (result.status === "dismissed") {
      this.announceDismissed();
      return null;
    }
    return result.reason ?? null;
  }

  async askConfirm(
    request: Omit<ConfirmPromptRequest, "kind">,
  ): Promise<boolean> {
    const result = await this.ask({ ...request, kind: "confirm" });
    if (result.status === "dismissed") {
      this.announceDismissed();
      return false;
    }
    return true;
  }

  async askFields(
    request: Omit<FieldsPromptRequest, "kind">,
  ): Promise<Record<string, string> | null> {
    const result = await this.ask({ ...request, kind: "fields" });
    if (result.status === "dismissed") {
      this.announceDismissed();
      return null;
    }
    return result.values ?? null;
  }
}

export function useActionPrompt(busy = false): {
  prompt: ActionPromptSession;
  host: ReactNode;
  notice: string | null;
} {
  const controller = useMemo(() => new ActionPromptController(), []);
  const [pending, setPending] = useState(controller.getPending());
  const [notice, setNotice] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  const announceDismissed = useCallback(() => {
    setNotice(DISMISSED_NOTICE);
  }, []);

  const prompt = useMemo(
    () => new ActionPromptSession(controller, announceDismissed),
    [controller, announceDismissed],
  );

  useEffect(() => controller.subscribe(setPending), [controller]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Scroll the prompt into view when it appears
  useEffect(() => {
    if (pending && hostRef.current) {
      hostRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [pending]);

  const host = (
    <div ref={hostRef} aria-live="polite" aria-atomic="true">
      {notice ? (
        <p
          className="mt-3 rounded-sm border border-line bg-inset px-3 py-2 text-sm text-ink-2"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {pending ? (
        <ActionPromptPanel
          request={pending.request}
          busy={busy}
          onDismiss={() => controller.dismiss()}
          onConfirm={(payload) =>
            controller.confirm({ status: "confirmed", ...payload })
          }
        />
      ) : null}
    </div>
  );

  return { prompt, host, notice };
}
