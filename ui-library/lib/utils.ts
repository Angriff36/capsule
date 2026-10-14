/** Joins class names, dropping empty ones. The library's sources import
 *  `cn` from shadcn's `@/lib/utils`; this is the same call without the
 *  clsx / tailwind-merge packages. */
export function cn(
  ...classes: Array<string | false | null | undefined | Record<string, boolean>>
): string {
  return classes
    .flatMap((entry) =>
      entry && typeof entry === "object"
        ? Object.entries(entry)
            .filter(([, on]) => on)
            .map(([name]) => name)
        : [entry],
    )
    .filter(Boolean)
    .join(" ");
}
