# Navigation shell

## Pieces

| Piece                    | Path                                                         |
| ------------------------ | ------------------------------------------------------------ |
| Shell layout             | `src/app/shell/AppShell.tsx`                                 |
| Sidebar                  | `src/app/shell/Sidebar.tsx`                                  |
| Topbar / command palette | `src/app/shell/Topbar.tsx`, `CommandPalette.tsx`             |
| Area catalog             | `src/app/nav.ts` + `src/app/navigation/NavigationCatalog.ts` |
| Planned areas            | `src/app/PlannedAreaPage.tsx`                                |

## Behavior

- `NAV_AREAS` defines primary rail entries (Operate / People / Business / System).
- Areas with `planned` render `PlannedAreaPage` instead of a feature module.
- Shipping slices today: Home, Events, Kitchen (placeholder). Others stay planned until proven.

## Rule

Add new product surface by extending `NAV_AREAS` and a `src/features/<slice>/` module. Do not invent parallel nav trees.
