# Capsule component catalog

Storybook is the discoverable catalog of reusable Capsule UI. Start here before
building UI, read the matching story and implementation, and reuse that component.
`DESIGN.md` owns presentation; stories show working variants and usage.

Run `bun run storybook` and open http://localhost:6007. The light/dark Scheme
toolbar uses the same `src/styles/app.css` as the app. `bun run check` includes
the Storybook build; this checks compilation, not visual or interaction behavior.

## Shared components

| Need | Import from | Story file |
| --- | --- | --- |
| Action dropdown, grouped actions, menu checkbox/radio choices, submenus | `src/ui/DropdownMenu.tsx` | `src/ui/DropdownMenu.stories.tsx` |
| Record picker for a dish, ingredient, client, vendor, or staff field (type-ahead fuzzy search, five recent picks pinned via `recentsKey`) | `src/ui/SearchSelect.tsx` | `src/ui/SearchSelect.stories.tsx` |
| Page heading and facts | `src/ui/primitives.tsx` (`PageHeader`) | `src/ui/PageHeader.stories.tsx` |
| Status chip | `src/ui/primitives.tsx` (`StatusChip`) | `src/ui/StatusChip.stories.tsx` |
| Empty state with action or next steps | `src/ui/EmptyState.tsx` | `src/ui/EmptyState.stories.tsx` |
| Working tables | `src/styles/app.css` (`.th` / `.td`, `.data-table`) | `src/ui/LedgerTable.stories.tsx` |
| Stat tile with optional real trend | `src/ui/charts/StatCard.tsx` | `src/ui/charts/StatCard.stories.tsx` |
| Info icon explaining a domain field (yield, batch multiplier, PAR, purchase) | `src/ui/FieldHelp.tsx` (terms in `src/ui/fieldHelpTerms.ts`) | `src/ui/FieldHelp.stories.tsx` |
| Confirmation or reason dialog | `src/ui/action-prompt/useActionPrompt.tsx` | `src/ui/action-prompt/ActionPrompt.stories.tsx` |
| Action result notice | `src/ui/action-result/ActionResultHost.tsx` | `src/ui/action-result/ActionResultHost.stories.tsx` |
| Event stage and readiness checks | `src/features/events/dashboard/EventStageRail.tsx` | Colocated `EventStageRail.stories.tsx` |
| Kitchen prep checklist row | `src/features/kitchen/PrepTaskRow.tsx` | Colocated `PrepTaskRow.stories.tsx` |
| Printable bar label and QR code for equipment, trucks and events | `src/ui/BarcodeLabel.tsx` | `src/ui/BarcodeLabel.stories.tsx` |
| Area tab strip with one More menu for occasional tabs | `src/ui/WorkspaceTabs.tsx` | `src/ui/WorkspaceTabs.stories.tsx` |
| A screen folded into another page (one h2, an anchor the old URL redirects to; the folded page reads `useEmbedded()` from `src/ui/embedded.ts` to drop its own title and area nav) | `src/ui/MergedSection.tsx` | `src/ui/MergedSection.stories.tsx` |
| Filter tabs with one sliding highlight and optional counts (replaces hand-made pill, switch and button strips) | `src/ui/SegmentedTabs.tsx` | `src/ui/UiLayouts.stories.tsx` |
| Modal window: centered on a computer, bottom sheet on a phone, focus kept inside | `src/ui/Dialog.tsx` | `src/ui/UiLayouts.stories.tsx` |
| Fold-open sections with animated height (replaces bare `<details>` blocks) | `src/ui/Accordion.tsx` | `src/ui/UiLayouts.stories.tsx` |
| File picker drop zone around a real file input; keeps the caller's `onChange` and `ref` | `src/ui/FileDrop.tsx` | `src/ui/UiLayouts.stories.tsx` |
| Pick several values with chips, search, Select all; posts hidden inputs by `name` (replaces `<select multiple>`) | `src/ui/MultiSelect.tsx` | `src/ui/UiLayouts.stories.tsx` |
| Redirect for a moved screen, keeping IDs, query and an optional #section | `src/app/MovedRoute.tsx` | — (route helper) |

## Dropdown usage

Adapted from [Origin UI](https://coss.com/origin/dropdown), using Radix for
keyboard navigation, typeahead, dismissal, focus return, and portalled positioning.
The MIT notice is in `src/ui/origin-ui.LICENSE.txt`. Capsule tokens supply its
colors, fonts, radii, and focus styling. Mobile menu rows have 44px targets.

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/DropdownMenu";

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button type="button" className="btn btn-ghost">More</button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onSelect={editEvent}>Edit event</DropdownMenuItem>
    <DropdownMenuItem asChild>
      <Link to="/events/templates">Templates</Link>
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

Use labeled groups and separators for related actions, `disabled` for temporarily
unavailable actions, and `variant="destructive"` for destructive actions. Menu
checkboxes and radio items support controlled state; prevent the selection event's
default when a checkbox menu should stay open. See stories for complete examples.
Submenus are available for existing nested action needs; prefer a flat menu when
that makes the task easier. Use a native select or the appropriate searchable
picker for form values, rather than treating an action menu as a combobox.

The Events index's More menu and the event page's More menu are production
examples. `ActionMenu` is gone; the remaining native `<details>` menus
(chat appearance, recents, top bar, notification tray) use `useDismissibleMenu`.
Use `DropdownMenu` for new action menus and keep existing actions, command
handling, and permission behavior intact when migrating one.

## UI Layouts components

SegmentedTabs, Dialog, Accordion, FileDrop and MultiSelect are adapted from
[ui-layouts](https://ui-layouts.com) (MIT notice in `src/ui/ui-layouts.LICENSE.txt`).
They use the `motion` package for their movement and honor reduced motion.
Their styles live in `src/ui/ui-layouts.css` and use only app.css tokens. Use
them in place of new hand-made filter strips, scrim-and-sheet pairs, bare
`<details>` folds, bare file inputs and `<select multiple>` boxes.

## UI Layouts Library (try-out previews)

Every ui-layouts part is in
Storybook under **UI Layouts Library**, grouped as on ui-layouts.com. The
sources live in `ui-library/` (outside `src/`): the app never imports them and
the design-vocab gate does not scan them. `ui-library/library.css` points the
library's shadcn color names at Capsule tokens, so previews follow light/dark.
To use a part in the app, adapt it into `src/ui/` with Capsule tokens, as was
done for SegmentedTabs, Dialog, Accordion, FileDrop and MultiSelect.

All 72 ui-layouts parts are previewed (196 stories). Their packages (embla,
vaul, Radix primitives, three / react-three, shiki, cmdk, pickers, particles,
lenis and others) are dev dependencies used only by these previews.

## Adding to the catalog

Search `src/**/*.stories.tsx` and the shared UI first. Extend an existing component
when it already serves the need. Add a colocated story for new reusable components
and meaningful variants, and update this table. Show the actual component with
useful populated, disabled, long-label, or error states as applicable. Story fixtures
stay in Storybook; they must not become persistent app data.

`src/ui/next/*.stories.tsx` contains exploration examples. Their presence in
Storybook alone does not establish a shipped default; inspect app usage before
adopting one. Components without stories can also exist: search `src/ui/` and the
owning feature before duplicating anything.
