# Copy-paste prompt: enter a component into Capsule

**Created:** 2026-07-17  
**Updated:** 2026-07-21 — look at `work/` photos first; Dish ≠ Component

Paste this into an IDE agent chat in the Capsule repo:

---

**Before entering anything, open the photos in `work/`:**

- `work/list3.jpg`, `work/list4.jpg`, `work/list5.jpg` — production sheets.
  Bold ALL-CAPS lines are **Dishes** (menu items). Indented lines under each
  dish are **DishTask** prep/portion lines with quantities. “MAKE X (DRIVE
  COMPONENT)” / “(COMPONENT)” points at a separate Component sheet.
- `work/components/*.jpg` (e.g. basil pesto, macaroni salad, lemonade concentrate)
  — those are **Components** (component formulas with ingredients + method).

Do **not** create a Component titled the same as a Dish. Do **not** invent
“batch formula” renames. A Dish’s ingredients/prep live on DishTask lines
(`dishtask_add`). A Component is only for reusable make-formulas.

Enter **component sheets** with Capsule MCP / governed commands only (no UI, no
direct DB writes). Prefer MCP (`preview_component_document` →
`enter_component_document`, or first-class snake tools). **Preview first. Do not
write until the preview lines look correct.** Entering a component does **not**
create a Dish (default).

Working directory: `C:/Projects/capsule`

1. Run `bun run agent:mint-jwt` if needed (active Capsule UI session + org).
2. For each component file, preview only:

```bash
bun run agent:enter-component -- --preview path/to/component.txt
```

3. Check the JSON: `catalogSize` must be > 0 (live Ingredient list). Ingredient
   `name`s must be real foods. Prefer `exact` / `possible` matches over creates.
   Yield/unit must look right (`gallons`, `qts`, `C` → cup).
4. **Do not** pass `--approve-new` for a bulk of unresolved lines without human
   OK. There is no pending-ingredient state — creates are **active** immediately.
5. Only after preview is clean (and human OK for any remaining news), enter:

```bash
bun run agent:enter-component -- path/to/component.txt --approve-new
```

6. Report preview summary (`exactMatchCount`, `unresolvedLineCount`,
   `wouldCreateIfApproved`) before asking to approve. If preview is wrong, stop.
7. Do not invent REST CRUD or edit generated `convex/mutations.ts`.

To add a **Dish with prep/ingredient lines** (production sheet shape): use
`dish_introduce` then `dishtask_add` for each line (optional `ingredientId` /
`componentId`). See `docs/event-prep-and-weekly-order-workflow.md`.

---

Enter without `--approve-new` only works when every line exactly matches the
ingredient catalog. Default is refuse-to-write on unresolved lines.
