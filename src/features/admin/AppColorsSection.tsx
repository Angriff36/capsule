import { useEffect, useMemo, useState } from "react";
import { useOrganizationConfigureAppPalette } from "../../lib/manifest-convex-react";
import { useActionFailure, useActionNotice } from "../../ui/action-result";
import { Section } from "../../ui/primitives";
import { SegmentedTabs } from "../../ui/SegmentedTabs";
import {
  PALETTE_TOKENS,
  applyAppPalette,
  defaultColors,
  parseAppPalette,
  serializeAppPalette,
  type AppPalette,
  type PaletteMode,
} from "./appPalette";
import { contrast, randomPalette } from "./randomPalette";

const MODES = [
  { value: "light", label: "Light mode" },
  { value: "dark", label: "Dark mode" },
] as const;

const HEX = /^#[0-9a-f]{6}$/i;

// Text and background pairs the app draws, and the contrast each needs.
const READ_CHECKS: readonly [string, string, number][] = [
  ["ink", "panel", 4.5],
  ["ink-2", "panel", 4.5],
  ["ink-3", "panel", 4.5],
  ["ink", "canvas", 4.5],
  ["brand", "panel", 4.5],
  ["brand", "brand-soft", 4.5],
  ["on-brand", "brand", 4.5],
];

interface OrganizationPaletteRecord {
  _id: string;
  version?: number;
  appPaletteJson?: string | null;
}

/**
 * The app's own colors for everyone in the company. Every change shows on
 * the whole app at once; Save keeps it for everyone, leaving without saving
 * puts the saved colors back.
 */
export function AppColorsSection({
  record,
  canEdit,
}: {
  record: OrganizationPaletteRecord | null | undefined;
  canEdit: boolean;
}) {
  const savedJson = record?.appPaletteJson;
  const saved = useMemo(() => parseAppPalette(savedJson), [savedJson]);
  const [draft, setDraft] = useState<AppPalette>(saved);
  const [mode, setMode] = useState<PaletteMode>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  const [defaults] = useState(defaultColors);
  const [busy, setBusy] = useState(false);
  const configure = useOrganizationConfigureAppPalette();
  const { notice, setNotice } = useActionNotice();
  const { error, setError } = useActionFailure();

  useEffect(() => setDraft(saved), [saved]);
  // Show the draft live; put the saved colors back when the page closes.
  useEffect(() => applyAppPalette(draft), [draft]);
  useEffect(() => () => applyAppPalette(saved), [saved]);

  const dirty = serializeAppPalette(draft) !== serializeAppPalette(saved);
  const labelOf = (token: string) =>
    PALETTE_TOKENS.find((entry) => entry.token === token)?.label ?? token;
  const colorOf = (token: string) =>
    draft[mode][token] ?? defaults[mode][token] ?? "#000000";
  const hardToRead = READ_CHECKS.filter(
    ([fg, bg, min]) => contrast(colorOf(fg), colorOf(bg)) < min,
  );

  const changed = (palette: AppPalette) =>
    Object.keys(palette.light).length + Object.keys(palette.dark).length > 0;

  const setColor = (token: string, value: string | null) =>
    setDraft((current) => {
      const colors = { ...current[mode] };
      if (value == null || value === defaults[mode][token])
        delete colors[token];
      else colors[token] = value.toLowerCase();
      return { ...current, [mode]: colors };
    });

  const save = async (next: AppPalette) => {
    if (!record) return;
    setBusy(true);
    setError(null);
    try {
      await configure({
        docId: record._id,
        version: record.version,
        paletteJson: serializeAppPalette(next),
      });
      setNotice(
        changed(next)
          ? "Saved. Everyone in the company now sees these colors."
          : "Back to the Capsule colors for everyone.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The colors were not saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="App colors"
      actions={
        <SegmentedTabs
          label="Colors for"
          size="sm"
          options={MODES}
          value={mode}
          onChange={setMode}
        />
      }
    >
      <div className="grid gap-4 p-4">
        <p className="text-sm text-ink-2">
          The colors of Capsule itself, for everyone in the company. A change
          shows on the whole app at once, so you can judge it by eye. Randomize
          tries a new light and dark set that stays easy to read. Save keeps it;
          leaving this page without saving puts the saved colors back.
        </p>
        <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {PALETTE_TOKENS.map(({ token, label, hint }) => {
            const own = draft[mode][token];
            const value = own ?? defaults[mode][token];
            return (
              <li
                key={token}
                className="flex items-center gap-3 border-b border-line py-2"
              >
                <input
                  type="color"
                  aria-label={`${label} color`}
                  value={value}
                  disabled={!canEdit || busy}
                  onChange={(event) => setColor(token, event.target.value)}
                  className="h-9 w-11 shrink-0 cursor-pointer rounded-sm border border-line bg-panel p-0.5"
                />
                <span className="grid min-w-0 flex-1">
                  <span className="text-sm font-semibold text-ink">
                    {label}
                  </span>
                  <span className="truncate text-xs text-ink-3">{hint}</span>
                </span>
                <input
                  aria-label={`${label} hex value`}
                  key={value}
                  defaultValue={value}
                  disabled={!canEdit || busy}
                  className="input w-24 font-mono text-xs"
                  onBlur={(event) => {
                    const text = event.target.value.trim();
                    if (HEX.test(text)) setColor(token, text);
                    else event.target.value = value;
                  }}
                />
                {own ? (
                  <button
                    type="button"
                    className="btn-link btn-link-compact"
                    disabled={!canEdit || busy}
                    onClick={() => setColor(token, null)}
                  >
                    Reset
                  </button>
                ) : (
                  <span className="w-[2.4rem]" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ul>
        {hardToRead.length > 0 ? (
          <p className="text-sm text-warn" role="status">
            Hard to read in {mode === "dark" ? "dark" : "light"} mode:{" "}
            {hardToRead
              .map(
                ([fg, bg]) =>
                  `${labelOf(fg)} on ${labelOf(bg)} (${contrast(colorOf(fg), colorOf(bg)).toFixed(1)}:1, needs 4.5:1)`,
              )
              .join("; ")}
            . You can still save.
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="text-sm text-ok" role="status">
            {notice}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canEdit || busy || !dirty || !record}
            onClick={() => void save(draft)}
          >
            {busy ? "Saving…" : "Save colors"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!canEdit || busy}
            onClick={() => setDraft(randomPalette())}
          >
            Randomize
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || !dirty}
            onClick={() => setDraft(saved)}
          >
            Undo changes
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!canEdit || busy || (!changed(saved) && !changed(draft))}
            onClick={() => {
              setDraft({ light: {}, dark: {} });
              void save({ light: {}, dark: {} });
            }}
          >
            Back to Capsule colors
          </button>
        </div>
      </div>
    </Section>
  );
}
