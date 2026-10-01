import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hold-to-talk recording for the walkie-talkie bar.
 *
 * Requests the microphone when the button is FIRST pressed (browsers only
 * grant it inside a user gesture), records while held, and hands the finished
 * take to the caller on release. Every stop path — release, cancel, unmount,
 * or the browser killing the track — tears the recorder and its stream down,
 * so the mic indicator never lingers.
 */

export type VoiceTake = {
  readonly blob: Blob;
  readonly durationMs: number;
};

type RecorderState = {
  readonly supported: boolean;
  /** True while the button is held and audio is being captured. */
  readonly recording: boolean;
  /** Milliseconds elapsed on the current take. */
  readonly elapsedMs: number;
  /** Set when the mic permission was denied or no mic exists. */
  readonly error: string | null;
  readonly begin: () => Promise<void>;
  /** Finish and deliver the take; a no-op when not recording. */
  readonly end: () => void;
  /** Finish and throw the take away. */
  readonly cancel: () => void;
  readonly clearError: () => void;
};

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime));
}

export function useVoiceRecorder(
  onTake: (take: VoiceTake) => void,
): RecorderState {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  // Latest callback without making it a dependency of the teardown effect.
  const onTakeRef = useRef(onTake);
  onTakeRef.current = onTake;

  const teardown = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    const stream = streamRef.current;
    streamRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setElapsedMs(0);
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Already stopped — nothing to do.
      }
    }
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const begin = useCallback(async () => {
    if (recorderRef.current) return;
    setError(null);
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError("This browser can't record audio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      setError(
        "Microphone access was blocked. Allow it in your browser settings.",
      );
      return;
    }
    streamRef.current = stream;
    cancelledRef.current = false;
    chunksRef.current = [];
    const mimeType = pickMime();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      teardown();
      setError("This browser can't record audio.");
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const durationMs = Date.now() - startedAtRef.current;
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      teardown();
      if (!cancelledRef.current && blob.size > 0) {
        onTakeRef.current({ blob, durationMs });
      }
    };
    startedAtRef.current = Date.now();
    recorder.start();
    setRecording(true);
    setElapsedMs(0);
    timerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 100);
  }, [teardown]);

  const stop = useCallback(
    (cancelTake: boolean) => {
      const recorder = recorderRef.current;
      if (!recorder) return;
      cancelledRef.current = cancelTake;
      if (recorder.state === "inactive") {
        teardown();
        return;
      }
      // onstop does the delivery and the teardown.
      recorder.stop();
    },
    [teardown],
  );

  const end = useCallback(() => stop(false), [stop]);
  const cancel = useCallback(() => stop(true), [stop]);
  const clearError = useCallback(() => setError(null), []);

  return {
    supported:
      typeof MediaRecorder !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia),
    recording,
    elapsedMs,
    error,
    begin,
    end,
    cancel,
    clearError,
  };
}
