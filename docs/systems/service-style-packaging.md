# Service Style drives packaging and pack lists — NOT a dish duplicate key

**Agents read this before touching dish deduplication, service styles, or pack lists.**

## The rule

`serviceStyle` on an EventDish is an **operational instruction**, not metadata:

- **Drop Off** → disposable packaging (to-go salad bowls, disposable serving utensils)
- **Cook on Site / Finish at Kitchen** → reusable transport packaging (hotel pans), on-site
  tossing/plating, real serving utensils

The same dish under a different service style packs **differently**: different containers,
different serving utensils, different transport.

## How this is wired

- Pack list templates are scoped by `serviceStyleId`
  (`src/features/logistics/PackListTemplatesPage.tsx`). A template matches an event when its
  `serviceStyleId` is null (unconstrained) or equals the event's style
  (`PackListDetailPage.tsx → matchesEvent`).
- EventDish carries `serviceStyle`; the pack list derives packaging from the event's style.

## Why dish names repeat across service styles

The TPP import created one Dish row per (name × service category): "Guacamole and Salsa Bar"
exists as *Drop Off*, *Finish at Event*, and *Finish at Kitchen* rows. These look like
duplicates by name, but the category encodes which packaging/pack-list path the dish takes.

**Deduplication consequence:** collapsing same-name dishes across different service categories
is ONLY safe if the surviving row's EventDish-level service style still drives the pack list.
Name-identical dishes within the SAME category with no other difference are safe merges.
When merging dish variants, verify the pack-list-relevant packaging assumptions travel with
the event, not the dish row.
