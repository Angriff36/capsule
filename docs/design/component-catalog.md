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
| Page heading and facts | `src/ui/primitives.tsx` (`PageHeader`) | `src/ui/PageHeader.stories.tsx` |
| Status chip | `src/ui/primitives.tsx` (`StatusChip`) | `src/ui/StatusChip.stories.tsx` |
| Empty state with action or next steps | `src/ui/EmptyState.tsx` | `src/ui/EmptyState.stories.tsx` |
| Working tables | `src/styles/app.css` (`.th` / `.td`, `.data-table`) | `src/ui/LedgerTable.stories.tsx` |
| Stat tile with optional real trend | `src/ui/charts/StatCard.tsx` | `src/ui/charts/StatCard.stories.tsx` |
| Confirmation or reason dialog | `src/ui/action-prompt/useActionPrompt.tsx` | `src/ui/action-prompt/ActionPrompt.stories.tsx` |
| Action result notice | `src/ui/action-result/ActionResultHost.tsx` | `src/ui/action-result/ActionResultHost.stories.tsx` |
| Event stage and readiness checks | `src/features/events/dashboard/EventStageRail.tsx` | Colocated `EventStageRail.stories.tsx` |
| Kitchen prep checklist row | `src/features/kitchen/PrepTaskRow.tsx` | Colocated `PrepTaskRow.stories.tsx` |
| Printable bar label for equipment, trucks and events | `src/ui/BarcodeLabel.tsx` | `src/ui/BarcodeLabel.stories.tsx` |

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

The Events index's More menu is a production example. Older `ActionMenu` callers
in `primitives.tsx` still use native details; use `DropdownMenu` for new action
menus and migrate those callers when changing their menus. Keep their existing
actions, command handling, and permission behavior intact.

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
