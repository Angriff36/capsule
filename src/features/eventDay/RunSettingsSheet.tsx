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
