import { ChevronDownIcon } from "../../ui/icons";
import { useDismissibleMenu } from "../../ui/useDismissibleMenu";
import {
  CHAT_ACCENTS,
  CHAT_APPEARANCE_DEFAULT,
  CHAT_LAYOUTS,
  useChatAppearance,
} from "./useChatAppearance";
import "./chat.css";

/**
 * "Appearance" in the thread header: layout (rows or bubbles) and the color
 * of your own bubbles. Saved on this device only, like dark mode.
 */
export function ChatAppearanceMenu() {
  const { layout, accent, set, reset } = useChatAppearance();
  const detailsRef = useDismissibleMenu();

  const isDefault =
    layout === CHAT_APPEARANCE_DEFAULT.layout &&
    accent === CHAT_APPEARANCE_DEFAULT.accent;

  return (
    <details ref={detailsRef} className="action-menu chat-appearance">
      <summary
        className="btn btn-ghost btn-sm"
        aria-haspopup="dialog"
        aria-label="Chat appearance"
      >
        <span
          className="chat-swatch chat-swatch-dot"
          data-chat-accent={accent}
          hidden={layout === "rows"}
          aria-hidden="true"
        />
        Appearance
        <ChevronDownIcon width={12} height={12} aria-hidden="true" />
      </summary>
      <div
        className="chat-appearance-panel"
        role="dialog"
        aria-label="Chat appearance"
      >
        <div>
          <p className="eyebrow">Layout</p>
          <div role="radiogroup" aria-label="Layout" className="chat-seg">
            {CHAT_LAYOUTS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="radio"
                aria-checked={layout === item.key}
                className="btn btn-ghost btn-sm"
                onClick={() => set({ layout: item.key })}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow">Your color</p>
          <div
            role="radiogroup"
            aria-label="Your color"
            className="chat-swatches"
          >
            {CHAT_ACCENTS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="radio"
                aria-checked={accent === item.key}
                aria-label={item.label}
                title={item.label}
                className="chat-swatch"
                data-chat-accent={item.key}
                onClick={() => set({ accent: item.key, layout: "bubbles" })}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-3">
            Only your own messages take the color. Picking one switches to
            Bubbles.
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-ink-3">Saved on this device.</p>
          {!isDefault ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={reset}
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>
    </details>
  );
}
