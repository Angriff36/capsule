import {
  menuPackagesFromEntries,
  type OldMenuPackage,
} from "../../../lib/tppReports/parseMenuPackages";
import { readZipEntriesInBrowser } from "../../../lib/tppReports/zipReaderBrowser";

/** Packages per save, so one call stays well inside a save's size. */
export const PACKAGES_PER_SAVE = 10;

export type PackageSaveResult = {
  added: number;
  updated: number;
  unchanged: number;
  lines: number;
  leftAlone: string[];
  notFound: string[];
  several: string[];
};

/** TPP's Menu Item Packages report, read with its fonts (.xlsx only). */
export async function readMenuPackagesFile(
  file: File,
): Promise<OldMenuPackage[]> {
  return menuPackagesFromEntries(
    await readZipEntriesInBrowser(new Uint8Array(await file.arrayBuffer())),
  );
}

export function addPackageResults(
  a: PackageSaveResult,
  b: PackageSaveResult,
): PackageSaveResult {
  return {
    added: a.added + b.added,
    updated: a.updated + b.updated,
    unchanged: a.unchanged + b.unchanged,
    lines: a.lines + b.lines,
    leftAlone: [...a.leftAlone, ...b.leftAlone],
    notFound: [...new Set([...a.notFound, ...b.notFound])].sort(),
    several: [...new Set([...a.several, ...b.several])].sort(),
  };
}

/** What the page says after the packages are saved. */
export function packageSummary(result: PackageSaveResult): string[] {
  const out = [
    `${result.added} package menus added, ${result.updated} given missing dishes, ${result.unchanged} already up to date; ${result.lines.toLocaleString()} dishes put on menus.`,
    'Each package is a draft menu "Old system package - <name>" under Menus. The old file has no prices or seasons, so set the price, then publish the menu to quote from it.',
  ];
  if (result.leftAlone.length > 0)
    out.push(
      `Left as they are (already published or archived): ${result.leftAlone.join(", ")}.`,
    );
  if (result.notFound.length > 0)
    out.push(
      `No dish of this name in Capsule, so not on the menu: ${result.notFound.join(", ")}.`,
    );
  if (result.several.length > 0)
    out.push(
      `More than one dish of this name, so not on the menu (add the right one by hand): ${result.several.join(", ")}.`,
    );
  return out;
}
