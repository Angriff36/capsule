import { useAction, useQuery } from "convex/react";
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
  const disableLoop = useAction(api.runOfShowAlerts.disableAlerts);

  const turnOnBackground = async () => {
    await push.enable();
    if (runStatus != null && !runStatus.enabled) await enableLoop({});
  };
  const turnOffBackground = async () => {
    await push.disable();
    if (runStatus?.enabled) await disableLoop({});
  };

  const pushStatusHint = push.blocked
    ? "Notifications are blocked in this phone's settings"
    : push.keyMissing
      ? "Not set up on this deployment yet"
      : push.accountEnabled
        ? push.deviceActive
          ? runStatus?.enabled
            ? "On — this phone receives task calls"
            : "On — task calls starting up"
          : "Needs one Allow tap on this phone"
        : "Off — alerts only while the page is open";

  return (
    <>
      <div className="evd-scrim" onClick={onClose} />
      <div className="evd-sheet" role="dialog" aria-label="Alert settings">
        <div className="evd-sheet-grip" />
        <div className="evd-sheet-head">
          <h2 className="evd-sheet-title">Alerts</h2>
          <button type="button" className="evd-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="evd-sheet-body">
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
          <p className="evd-kicker">Warn before start</p>
          <div className="evd-set-seg">
            {LEAD_MINUTE_CHOICES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={`evd-set-seg-btn${
                  settings.leadMinutes === minutes ? " evd-set-seg-on" : ""
                }`}
                onClick={() => onChange({ ...settings, leadMinutes: minutes })}
              >
                {minutes === 0 ? "Off" : `${minutes} min`}
              </button>
            ))}
          </div>
          {hasMe ? (
            <>
              <p className="evd-kicker">Show</p>
              <div className="evd-set-seg">
                <button
                  type="button"
                  className={`evd-set-seg-btn${
                    settings.scope === "crew" ? " evd-set-seg-on" : ""
                  }`}
                  onClick={() => onChange({ ...settings, scope: "crew" })}
                >
                  Crew
                </button>
                <button
                  type="button"
                  className={`evd-set-seg-btn${
                    settings.scope === "me" ? " evd-set-seg-on" : ""
                  }`}
                  onClick={() => onChange({ ...settings, scope: "me" })}
                >
                  Just me
                </button>
              </div>
            </>
          ) : null}
          <p className="evd-kicker">Background alerts</p>
          {!push.supported ? (
            <p className="evd-set-note">
              This browser can't do background alerts. On iPhone, add Capsule to
              your home screen first.
            </p>
          ) : push.needsHomeScreen ? (
            <p className="evd-set-note">
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
                  className="evd-set-seg-btn evd-set-try"
                  onClick={() => void push.activateThisDevice()}
                >
                  Allow on this phone
                </button>
              ) : null}
              {push.error ? <p className="evd-set-note">{push.error}</p> : null}
              <p className="evd-set-note">
                Background alerts call the next task out on this phone even when
                Capsule is closed — 5 minutes before, at the start, and once
                when a task runs late. They also switch on message alerts.
              </p>
            </>
          )}
          <button
            type="button"
            className="evd-run-btn evd-set-try"
            onClick={onTry}
          >
            Try it
          </button>
          <p className="evd-set-note">
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
      className={`evd-set-row${on ? " evd-set-on" : ""}`}
      onClick={onToggle}
    >
      <span className="evd-set-main">
        <span className="evd-set-label">{label}</span>
        <span className="evd-set-hint">{hint}</span>
      </span>
      <span className="evd-set-switch" aria-hidden>
        <span className="evd-set-knob" />
      </span>
    </button>
  );
}
