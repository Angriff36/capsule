// "Randomize" for the App colors editor. Hues are random; lightness and
// saturation stay inside ranges that keep Capsule calm, and every text color
// is pushed lighter or darker until it passes WCAG contrast against the
// surfaces it sits on. Both modes share one roll, so light and dark match.
import type { AppPalette } from "./appPalette";

type Hsl = { h: number; s: number; l: number };

const between = (min: number, max: number) => min + Math.random() * (max - min);

function hex({ h, s, l }: Hsl): string {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Moves lightness toward `direction` until the color reaches `min` contrast
 *  against every surface, or lightness runs out. */
function fitHsl(
  color: Hsl,
  surfaces: readonly string[],
  min: number,
  direction: -1 | 1,
): Hsl {
  const next = { ...color };
  while (
    surfaces.some((surface) => contrast(hex(next), surface) < min) &&
    next.l > 0 &&
    next.l < 100
  ) {
    next.l = Math.max(0, Math.min(100, next.l + direction));
  }
  return next;
}

const fit = (
  color: Hsl,
  surfaces: readonly string[],
  min: number,
  direction: -1 | 1,
) => hex(fitHsl(color, surfaces, min, direction));

// Status colors keep their meaning: green, amber, red, blue.
const STATUS = { ok: 150, warn: 35, danger: 4, info: 222 } as const;

function mode(dark: boolean, brandHue: number, tintHue: number) {
  const tint = between(4, 14);
  const surface = (l: number, s = tint) => hex({ h: tintHue, s, l });
  const canvas = surface(dark ? between(8, 11) : between(93, 96));
  const panel = surface(
    dark ? between(13, 16) : between(98.5, 100),
    tint * 0.6,
  );
  const inset = surface(dark ? between(16, 19) : between(95.5, 97.5));
  const sage = surface(dark ? between(15, 18) : between(90, 93));
  const rail = surface(dark ? between(7, 10) : between(90, 93));
  const surfaces = [canvas, panel, inset];
  const toward = dark ? 1 : -1;
  const text = (l: number, min: number) =>
    fit({ h: tintHue, s: tint, l }, surfaces, min, toward);

  const brandSat = between(45, 80);
  const brandStart = dark ? between(55, 70) : between(38, 50);
  // Light: links stay readable on cards and the white arrow on brand.
  const brand = dark
    ? fitHsl(
        { h: brandHue, s: brandSat, l: brandStart },
        [panel, canvas],
        4.5,
        1,
      )
    : fitHsl(
        { h: brandHue, s: brandSat, l: brandStart },
        [panel, canvas, "#ffffff"],
        4.5,
        -1,
      );
  const status = (hue: number) =>
    fit(
      { h: hue + between(-6, 6), s: between(55, 75), l: dark ? 62 : 38 },
      [panel, canvas],
      4.5,
      toward,
    );

  return {
    brand: hex(brand),
    // Light mode: brand passed 4.5:1 against white. Dark mode: brand passed
    // 4.5:1 against the dark canvas, so the canvas color reads on it.
    "on-brand": dark ? canvas : "#ffffff",
    // Hover: a step further from the page than the brand itself.
    "accent-deep": hex({
      ...brand,
      l: Math.max(5, Math.min(95, brand.l + (dark ? 8 : -9))),
    }),
    "brand-soft": hex({ h: brandHue, s: dark ? 25 : 70, l: dark ? 19 : 94 }),
    canvas,
    panel,
    inset,
    sage,
    rail,
    ink: text(dark ? 88 : 10, 7),
    "ink-2": text(dark ? 74 : 26, 4.5),
    "ink-3": text(dark ? 60 : 42, 4.5),
    line: surface(dark ? between(22, 26) : between(83, 87)),
    "line-2": surface(dark ? between(30, 35) : between(74, 79)),
    ok: status(STATUS.ok),
    warn: status(STATUS.warn),
    danger: status(STATUS.danger),
    info: status(STATUS.info),
  };
}

export function randomPalette(): AppPalette {
  const brandHue = between(0, 360);
  // The tint sits near the brand or opposite it, never a third clashing hue.
  const tintHue =
    (brandHue + (Math.random() < 0.6 ? between(-25, 25) : 180) + 360) % 360;
  return {
    light: mode(false, brandHue, tintHue),
    dark: mode(true, brandHue, tintHue),
  };
}
