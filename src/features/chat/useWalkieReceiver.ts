import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessageView } from "./chatTypes";
import { useChatChannel } from "./useTeamChat";
import type { ChatChannel } from "./chatTypes";

/**
 * The walkie receiver: when THIS DEVICE is armed for an event channel, every
 * incoming voice take plays out loud the moment it arrives — no tapping, no
 * accepting, like a real walkie-talkie. The arm switch is a device setting
 * (like the chat appearance toggle), not a server setting, because it is the
 * speaker in your hand that gets armed, not your account.
 *
 * Armed playback works because arming is itself a user gesture: the press on
 * the switch unlocks audio for the page, so browsers let the takes through.
 * A page that was never touched (fresh reload, phone just woken) stays quiet
 * until one interaction — that is the browser's rule and no code beats it.
 */

const STORAGE_KEY = "capsule-walkie-armed";
const CHANGE_EVENT = "capsule-walkie-armed";

function readArmed(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeArmed(next: Record<string, boolean>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Private mode or full storage: the switch just won't persist.
  }
}

/** React to arm-state changes across every mounted receiver (and tabs). */
export function useWalkieArmed(channelKey: string) {
  const [armed, setArmed] = useState(() => readArmed()[channelKey] ?? false);

  useEffect(() => {
    const sync = () => setArmed(readArmed()[channelKey] ?? false);
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [channelKey]);

  const setArmedFor = useCallback(
    (next: boolean) => {
      const state = readArmed();
      if (next) state[channelKey] = true;
      else delete state[channelKey];
      writeArmed(state);
    },
    [channelKey],
  );

  return [armed, setArmedFor] as const;
}

/**
 * Watches the channel and speaks every new voice take when armed. Returns a
 * transient "receiving" flag so the UI can flash while a take plays.
 */
export function useWalkieReceiver(options: {
  channel: ChatChannel | null;
  channelKey: string;
  myPersonId: string | null;
}) {
  const { channel, channelKey, myPersonId } = options;
  const thread = useChatChannel(channel);
  const [armed] = useWalkieArmed(channelKey);
  const [receiving, setReceiving] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedRef = useRef<Set<string>>(new Set());
  // Watermark: the newest message id present in the FIRST snapshot after
  // (re)mount. Everything at or before it is history — a reload or a return
  // to the tab must never blast old takes; only arrivals AFTER the watermark
  // speak. Re-armed mid-session uses the same idea: the snapshot at the
  // moment of arming becomes history, the next arrival is live.
  const watermarkRef = useRef<string | null>(null);
  const armedRef = useRef(armed);
  armedRef.current = armed;
  const meRef = useRef(myPersonId);
  meRef.current = myPersonId;

  // One shared element: a new take pauses the previous one, like a radio
  // cutting through. Never appended to the DOM — it plays either way.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;
    const stop = () => setReceiving(false);
    audio.addEventListener("ended", stop);
    audio.addEventListener("pause", stop);
    audio.addEventListener("error", stop);
    return () => {
      audio.pause();
      audio.removeEventListener("ended", stop);
      audio.removeEventListener("pause", stop);
      audio.removeEventListener("error", stop);
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const messages = thread?.messages;
    if (!messages || messages.length === 0) return;
    const sorted = [...messages].sort((a, b) => a.createdAt - b.createdAt);
    // First sight of this channel: everything on screen is history. Seed
    // the watermark (and the played set) so neither an armed reload nor a
    // mid-session arm ever replays it.
    if (watermarkRef.current === null) {
      watermarkRef.current = sorted[sorted.length - 1]._id;
      for (const message of sorted) playedRef.current.add(message._id);
      return;
    }
    if (!armedRef.current) return;
    const watermarkIndex = sorted.findIndex(
      (message) => message._id === watermarkRef.current,
    );
    // Only takes newer than the watermark speak.
    const arrivals =
      watermarkIndex === -1 ? sorted : sorted.slice(watermarkIndex + 1);
    for (const message of arrivals) {
      // Keep the watermark at the newest message SEEN (even a text one):
      // history advances whether or not a take is involved.
      watermarkRef.current = message._id;
      if (playedRef.current.has(message._id)) continue;
      playedRef.current.add(message._id);
      const take = message.attachments.find(
        (attachment) =>
          attachment.contentType.startsWith("audio/") &&
          attachment.url !== null,
      );
      if (!take) continue;
      // My own transmissions don't come back through my speaker.
      if (message.senderPersonId === meRef.current) continue;
      const audio = audioRef.current;
      if (!audio) continue;
      audio.pause();
      if (take.url) {
        audio.src = take.url;
      }
      setReceiving(true);
      window.dispatchEvent(new Event("capsule-walkie-speaking"));
      void audio.play().catch(() => setReceiving(false));
    }
  }, [thread?.messages]);

  return { armed, receiving, thread };
}
