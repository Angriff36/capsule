import { useEffect, useState } from "react";
import { useWalkieArmed } from "./useWalkieReceiver";
import "./chat.css";

const SPEAKING_EVENT = "capsule-walkie-speaking";

declare global {
  interface WindowEventMap {
    [SPEAKING_EVENT]: Event;
  }
}

/**
 * The walkie power switch for one event channel, shown in the event header so
 * it is reachable from every tab. Turning it on unlocks audio for the page
 * (the press IS the user gesture), so armed devices blast takes out loud with
 * no tapping — flip it before service and put the phone in your pocket. The
 * dot flashes while a take is coming through.
 */
export function WalkieToggle({ channelKey }: { readonly channelKey: string }) {
  const [armed, setArmed] = useWalkieArmed(channelKey);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    let timer: number | null = null;
    const onSpeaking = () => {
      setSpeaking(true);
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => setSpeaking(false), 1500);
    };
    window.addEventListener(SPEAKING_EVENT, onSpeaking);
    return () => {
      window.removeEventListener(SPEAKING_EVENT, onSpeaking);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return (
    <button
      type="button"
      className="btn btn-ghost walkie-toggle"
      data-armed={armed ? "true" : "false"}
      data-speaking={speaking ? "true" : "false"}
      aria-pressed={armed}
      aria-label={
        armed
          ? "Walkie is ON — voice messages play out loud. Turn off."
          : "Walkie is OFF — turn on to hear voice messages out loud."
      }
      onClick={() => setArmed(!armed)}
    >
      <span className="walkie-toggle-dot" aria-hidden="true" />
      Walkie {armed ? "ON" : "OFF"}
    </button>
  );
}
