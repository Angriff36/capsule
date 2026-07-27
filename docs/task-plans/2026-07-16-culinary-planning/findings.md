# Findings & Decisions: Culinary planning slice

> Archived after implementation and verification handoff on 2026-07-16.

## Final generated-creation pivot

- During final verification, the live regenerated client surface gained governed `useCreate*` hooks backed by `createVia*` mutations for every Culinary entity in scope.
- The initial authored allocation seam was therefore removed before handoff. Kitchen now consumes generated creation, query, mutation, and lifecycle surfaces directly.
- The guard deliberately rejects any future authored Culinary allocation seam or direct database insert.

## Requirements

- Implement the next Kitchen slice after Events in `C:\projects\capsule`.
- Use existing Manifest-generated APIs and lifecycle metadata.
- Keep the work as a thin end-to-end Culinary planning outcome.
- Follow the repository slice gate: focused tests, complete state handling, owner-doc update, dependency checks, and `bun run check`.

## Research Findings

- The current repo sequence defines Slice 2 as Culinary planning: maintain ingredients, components, and dishes; publish menus; select event dishes.
- The older Capsule-V2 memory named Kitchen production/tasks as the next slice, but that is stale for this checkout and would skip the current repo's Culinary slice.
- `/kitchen` currently renders only `KitchenRoutePlaceholder`; all six Culinary entities have generated list/detail/index queries and command hooks.
- The Culinary owner page calls for a culinary-book workspace, not a dashboard, and explicitly forbids inventing procedures, prep time, nutrition, media, or imported component behavior.
- Production and quality are separately owned and remain out of scope.
- `DESIGN.md` defines the route family at `/kitchen/components`, sibling Components/Dishes/Ingredients views, Menus as a separate composition surface, large serif object documents, and explicit responsive reduction rules.
- `src/styles/app.css` already contains committed Component Book and culinary-document classes, including catalog, empty, detail, facts, tags, and responsive treatments; implementation should reuse them.
- Ingredient commands: introduce, update details, classify allergens, update costing, discontinue, reinstate.
- Component commands: draft, revise draft, publish version, retract, retire; ComponentIngredient supports add, adjust quantity, remove.
- Dish commands: introduce, revise details, change component, update portioning, classify allergens, retire, reinstate.
- Menu commands: draft, revise details, update pricing, publish, unpublish, archive, restore.
- EventDish is the modeled event composition record: `addToEvent`, adjust servings, change course/service style, update instructions, remove. MenuDish exists for catalog menus; EventDish is the event composition handoff.
- ~~EventDish writes are guarded to Event stages planning, pending approval, or approved.~~
  > **Correction (2026-07-19):** EventDish add/remove/course/instructions allowed through **executing** (86/swap mid-service); servings may be `0`. See `docs/architecture/domain-gating-restraint.md`.

## Technical Decisions

| Decision                                                                                             | Rationale                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Start from source commands and generated bindings, then design authored pages                        | Avoids local policy/lifecycle duplication and accidental Manifest bypass.                                        |
| Use the existing Archivo/IBM Plex Mono industrial editorial system                                   | Keeps the new workspace cohesive with Events while allowing a distinct culinary-book composition.                |
| Treat Menu as its own publishable priced document and EventDish as the real dish-composition handoff | This matches canonical source and resolves the open Menu↔Dish question without inventing a missing relationship. |

## Issues Encountered

| Issue                                                                               | Resolution                                                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Current worktree contains unrelated tracked and untracked documentation/design work | Treat it as user-owned, patch overlapping files surgically, and verify task-only changes separately if global gates are contaminated. |

## Resources

- `docs/product/implementation-plan.md`
- `docs/systems/culinary.md`
- `src/culinary/*.manifest`
- `src/features/kitchen/KitchenRoutePlaceholder.tsx`
- `src/lib/manifest-convex-react.ts`

## Visual/Browser Findings

- Not inspected yet.

# 2026-07-16 — Generated culinary surface

- Generated React hooks already cover list/get plus commands for Ingredient, Component, ComponentIngredient, Dish, Menu, and EventDish.
- Generated bindings export typed client inputs and lifecycle arrays such as `ComponentPublishVersionLifecycle`, `ComponentRetireLifecycle`, `MenuMarkPublishedLifecycle`, and `MenuUnpublishLifecycle`; authored UI should consume these rather than restating transition rules.
- Manifest creation commands are instance commands, so the authored slice likely needs the same narrow allocation/action seam used by Event: allocate the minimum document shape, invoke the generated command, and delete the allocation if the command rejects.
- `EventDish` must be allocated with its parent `eventId` before `addToEvent` (or use `EventDish_createViaAddToEvent`) so parent-stage policy can run against the real event.
- Generated command bodies insert domain events and accept preallocated `docId` values; allocation is not performed by those generated mutations.
- ~~Source truth does not define Menu-to-Dish membership.~~
  > **Correction (2026-07-19):** `MenuDish` models catalog menu membership; EventDish remains the event composition handoff.
- Component publication does not currently require ingredient lines in Manifest source. The UI must not add that local policy.

## Allocation requirements

- Generated create-like mutations (`Ingredient_introduce`, `Component_draft`, `ComponentIngredient_add`, `Dish_introduce`, `Menu_draft`, `EventDish_addToEvent`) all require a valid preallocated `docId` and fail if the row does not exist.
- The authored allocation seam must seed schema-valid neutral values only:
  - Ingredient: name, unit, cost, active status.
  - Component: name, yield, batch multiplier, draft status, version number.
  - ComponentIngredient: component and ingredient references, quantity/unit/sort order.
  - Dish: component reference, portion values, active status.
  - Menu: pricing/guest-range defaults and draft status.
  - EventDish: event and dish references plus servings; the event reference is required for generated parent-stage policy.
- Generated mutations own validation, role checks, transitions, event emission, versioning, and timestamps. The seam must not duplicate any of those behaviors.

## Visual reference decisions

- The local Galley references reinforce a book-first information architecture: Component/Ingredient/Menu are peer catalogs, while a component opens as a full-width working document.
- The useful pattern is hierarchy and density, not the reference's decorative food imagery. Capsule's committed CSS already translates it into the warm-white, sage, serif/mono system.
- Only source-backed component facts should appear. The reference's prep time, HACCP, media, nutrition, and derived allergen affordances are intentionally excluded because Manifest does not model them in this slice.

## Existing authored seam pattern

- `convex/lib/eventPlanning.ts` is the canonical implementation model: tenant-aware internal allocators, one cleanup mutation, and public actions that call exact generated mutations.
- `src/features/events/eventPlanningApi.ts` wraps those actions with generated client input types and returns typed Convex IDs.
- Kitchen should follow this pattern in its own authored seam, leaving the Event seam untouched.
- The current app has only a `/kitchen` placeholder. The smallest coherent route family is `/kitchen/:section` for peer catalogs plus `/kitchen/components/:id` for the working document; `/kitchen` should resolve to components.

## Test and repository-gate pattern

- Existing tests verify integration structurally, while pure lifecycle policies receive behavioral tests.
- The current repository gate invokes a focused Event Manifest guard before typecheck. Kitchen should gain an equivalent focused guard command and join `bun run check`, without broadening or rewriting the Event guard.
- Existing UI primitives support loading, empty, error, and status states; culinary-specific committed CSS should own the book/document layout.

## Generated Menu lifecycle nuance

- Generated metadata proves `Menu.restore` from both `published` and `archived`, and `Menu.unpublish` from both states as well.
- The authored policy must expose that generated availability as-is. It must not simplify the state offers based on a locally preferred lifecycle model.
