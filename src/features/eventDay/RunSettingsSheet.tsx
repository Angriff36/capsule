import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../lib/api";
import { usePushNotifications } from "../chat/usePushNotifications";
import { LEAD_MINUTE_CHOICES, type RunSettings } from "./runOfShowModel";

/**
 * Per-device alert settings for the run-of-show tracker. Settings live in
 * localStorage on the phone — nothing here is shared server state.
 */
export function RunSettingsSheet({
  settings,
  hasMe,
  onChange,
  onTry,
  onClose,
}: {
  settings: RunSettings;
  hasMe: boolean;
  onChange: (next: RunSettings) => void;
  onTry: () => void;
  onClose: () => void;
}) {
  const push = usePushNotifications();
  const runStatus = useQuery(api.runOfShowAlerts.getStatus, {});
  const enableLoop = useAction(api.runOfShowAlerts.enableAlerts);

  const [loopError, setLoopError] = useState<string | null>(null);
  const turnOnBackground = async () => {
    setLoopError(null);
    await push.enable();
    if (runStatus != null && !runStatus.enabled) {
      try {
        await enableLoop({});
      } catch (cause) {
        setLoopError(
          `Task calls could not be started. Try again. ${cause instanceof Error ? cause.message : ""}`.trim(),
        );
      }
    }
  };
  // Personal switch only: the account preference gates this phone's
  // delivery. Turning it off must NOT stop the tenant-wide scanner the
  // rest of the crew relies on.
  const turnOffBackground = async () => {
    await push.disable();
  };

  const pushStatusHint = push.blocked
    ? "Notifications are blocked in this phone's settings"
    : push.keyMissing
      ? "Not set up in Capsule yet"
      : push.accountEnabled
        ? push.deviceActive
          ? runStatus?.enabled
            ? "On — this phone receives task calls"
            : "On — task calls starting up"
          : "Needs one Allow tap on this phone"
        : "Off — alerts only while the page is open";

  return (
    <>
      <div className="eday-scrim" onClick={onClose} />
      <div className="eday-sheet" role="dialog" aria-label="Alert settings">
        <div className="eday-sheet-grip" />
        <div className="eday-sheet-head">
          <h2 className="eday-sheet-title">Alerts</h2>
          <button type="button" className="eday-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="eday-sheet-body">
          <SettingToggle
            label="Voice callouts"
            hint="Phone speaks each task out loud"
            on={settings.voice}
            onToggle={() => onChange({ ...settings, voice: !settings.voice })}
          />
          <SettingToggle
            label="Vibration"
            hint="Buzz when a task starts"
            on={settings.vibrate}
            onToggle={() =>
              onChange({ ...settings, vibrate: !settings.vibrate })
            }
          />
          <SettingToggle
            label="Alarm tone"
            hint="Repeating tone until you dismiss it"
            on={settings.alarm}
            onToggle={() => onChange({ ...settings, alarm: !settings.alarm })}
          />
          <p className="eday-kicker">Warn before start</p>
          <div className="eday-set-seg">
            {LEAD_MINUTE_CHOICES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={`eday-set-seg-btn${
                  settings.leadMinutes === minutes ? " eday-set-seg-on" : ""
                }`}
                onClick={() => onChange({ ...settings, leadMinutes: minutes })}
              >
                {minutes === 0 ? "Off" : `${minutes} min`}
              </button>
            ))}
          </div>
          {hasMe ? (
            <>
              <p className="eday-kicker">Show</p>
              <div className="eday-set-seg">
                <button
                  type="button"
                  className={`eday-set-seg-btn${
                    settings.scope === "crew" ? " eday-set-seg-on" : ""
                  }`}
                  onClick={() => onChange({ ...settings, scope: "crew" })}
                >
                  Crew
                </button>
                <button
                  type="button"
                  className={`eday-set-seg-btn${
                    settings.scope === "me" ? " eday-set-seg-on" : ""
                  }`}
                  onClick={() => onChange({ ...settings, scope: "me" })}
                >
                  Just me
                </button>
              </div>
            </>
          ) : null}
          <p className="eday-kicker">Background alerts</p>
          {!push.supported ? (
            <p className="eday-set-note">
              This browser can't do background alerts. On iPhone, add Capsule to
              your home screen first.
            </p>
          ) : push.needsHomeScreen ? (
            <p className="eday-set-note">
              On iPhone, add Capsule to your home screen first, then turn
              background alerts on.
            </p>
          ) : (
            <>
              <SettingToggle
                label="Phone alerts when the app is closed"
                hint={pushStatusHint}
                on={push.accountEnabled}
                onToggle={() => {
                  void (push.accountEnabled
                    ? turnOffBackground()
                    : turnOnBackground());
                }}
              />
              {push.deviceNeedsSetup ? (
                <button
                  type="button"
                  className="eday-set-seg-btn eday-set-try"
                  onClick={() => void push.activateThisDevice()}
                >
                  Allow on this phone
                </button>
              ) : null}
              {push.error ? (
                <p className="eday-set-note">{push.error}</p>
              ) : null}
              {loopError ? (
                <p className="eday-set-note" role="alert">
                  {loopError}
                </p>
              ) : null}
              <p className="eday-set-note">
                Background alerts call the next task out on this phone even when
                Capsule is closed — 5 minutes before, at the start, and once
                when a task runs late. They also switch on message alerts.
                Turning this off stops only your phone; the rest of the crew
                keeps theirs.
              </p>
            </>
          )}
          <button
            type="button"
            className="eday-run-btn eday-set-try"
            onClick={onTry}
          >
            Try it
          </button>
          <p className="eday-set-note">
            Alerts fire while this page is open. Keep the phone awake during the
            event, and tap “Arm alerts” once after you open it.
          </p>
        </div>
      </div>
    </>
  );
}

function SettingToggle({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`eday-set-row${on ? " eday-set-on" : ""}`}
      onClick={onToggle}
    >
      <span className="eday-set-main">
        <span className="eday-set-label">{label}</span>
        <span className="eday-set-hint">{hint}</span>
      </span>
      <span className="eday-set-switch" aria-hidden>
        <span className="eday-set-knob" />
      </span>
    </button>
  );
}
