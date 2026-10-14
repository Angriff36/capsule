// The company's own app colors (Organization.appPaletteJson), set on the
// Branding page. Each entry overrides one app.css color token for light or
// dark mode; anything not set keeps the DESIGN.md color.

export type PaletteMode = "light" | "dark";
export type AppPalette = Record<PaletteMode, Record<string, string>>;

/** The colors a person can change, in the order the editor lists them. */
export const PALETTE_TOKENS: readonly {
  token: string;
  label: string;
  hint: string;
  /** Other tokens that always follow this one. */
  alsoSets?: readonly string[];
}[] = [
  {
    token: "brand",
    label: "Brand",
    hint: "Main buttons, links, the active menu item",
    alsoSets: ["accent", "rail-active", "service"],
  },
  {
    token: "on-brand",
    label: "Text on brand",
    hint: "Words and icons on brand fills, like the chosen menu item",
  },
  { token: "accent-deep", label: "Brand, dark", hint: "Brand on hover" },
  {
    token: "brand-soft",
    label: "Brand, soft",
    hint: "Light brand fills behind chosen rows and badges",
    alsoSets: ["accent-soft"],
  },
  { token: "canvas", label: "Page background", hint: "Behind everything" },
  { token: "panel", label: "Cards", hint: "Cards, tables, menus" },
  { token: "inset", label: "Inset", hint: "Fields and sunken areas" },
  { token: "sage", label: "Soft fill", hint: "Chips and quiet bands" },
  { token: "rail", label: "Side menu", hint: "The left menu background" },
  { token: "ink", label: "Text", hint: "Headings and main text" },
  { token: "ink-2", label: "Text, second", hint: "Body text and labels" },
  { token: "ink-3", label: "Text, quiet", hint: "Hints and dates" },
  { token: "line", label: "Lines", hint: "Borders and rules" },
  { token: "line-2", label: "Lines, strong", hint: "Field borders" },
  {
    token: "ok",
    label: "Good",
    hint: "Done, approved",
    alsoSets: ["success"],
  },
  {
    token: "warn",
    label: "Warning",
    hint: "Needs a look",
    alsoSets: ["warning"],
  },
  { token: "danger", label: "Problem", hint: "Blocked, delete" },
  { token: "info", label: "Info", hint: "Notes and links to more" },
];

const HEX = /^#[0-9a-f]{6}$/i;

export const emptyPalette = (): AppPalette => ({ light: {}, dark: {} });

/** Reads the stored JSON. Bad or unknown entries are dropped, never thrown. */
export function parseAppPalette(json: string | null | undefined): AppPalette {
  const palette = emptyPalette();
  if (!json) return palette;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return palette;
  }
  if (!raw || typeof raw !== "object") return palette;
  const known = new Set(PALETTE_TOKENS.map((entry) => entry.token));
  for (const mode of ["light", "dark"] as const) {
    const colors = (raw as Record<string, unknown>)[mode];
    if (!colors || typeof colors !== "object") continue;
    for (const [token, value] of Object.entries(colors)) {
      if (known.has(token) && typeof value === "string" && HEX.test(value))
        palette[mode][token] = value.toLowerCase();
    }
  }
  return palette;
}

export function serializeAppPalette(palette: AppPalette): string | undefined {
  const used =
    Object.keys(palette.light).length + Object.keys(palette.dark).length;
  return used === 0 ? undefined : JSON.stringify(palette);
}

function declarations(colors: Record<string, string>): string {
  const lines: string[] = [];
  for (const entry of PALETTE_TOKENS) {
    const value = colors[entry.token];
    if (!value) continue;
    for (const token of [entry.token, ...(entry.alsoSets ?? [])])
      lines.push(`--color-${token}: ${value};`);
  }
  return lines.join(" ");
}

const STYLE_ID = "app-palette";

/** Puts the palette on the page. html:not(.dark) / html.dark outrank the
 *  :root and .dark rules in app.css, so these colors win in both modes. */
export function applyAppPalette(palette: AppPalette): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  const light = declarations(palette.light);
  const dark = declarations(palette.dark);
  if (!light && !dark) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = `html:not(.dark) { ${light} } html.dark { ${dark} }`;
}

/** The DESIGN.md colors of every editable token in both modes, read with
 *  the palette off. The mode class flips and returns inside one task, so the
 *  page never paints the other mode. */
export function defaultColors(): AppPalette {
  const root = document.documentElement;
  const style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  const wasDark = root.classList.contains("dark");
  if (style) style.disabled = true;
  const read = (): Record<string, string> => {
    const computed = getComputedStyle(root);
    return Object.fromEntries(
      PALETTE_TOKENS.map(({ token }) => {
        const value = computed.getPropertyValue(`--color-${token}`).trim();
        return [token, HEX.test(value) ? value.toLowerCase() : "#000000"];
      }),
    );
  };
  root.classList.remove("dark");
  const light = read();
  root.classList.add("dark");
  const dark = read();
  root.classList.toggle("dark", wasDark);
  if (style) style.disabled = false;
  return { light, dark };
}
