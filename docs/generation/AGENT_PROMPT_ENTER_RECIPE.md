# Copy-paste prompt: enter a recipe into Capsule

**Created:** 2026-07-17  
**Updated:** 2026-07-17 — preview-first; never auto-create unmatched ingredients

Paste this into an IDE agent chat in the Capsule repo:

---

Enter recipes into Capsule using governed commands only (no UI, no direct DB
writes). **Preview first. Do not write until the preview lines look correct.**

Working directory: `C:/Projects/capsule`

1. Run `bun run agent:mint-jwt` if needed (active Capsule UI session + org).
2. For each recipe file, preview only:

```bash
bun run agent:enter-recipe -- --preview path/to/recipe.txt
```

3. Check the JSON: `catalogSize` must be > 0 (live Ingredient list). Ingredient
   `name`s must be real foods. Prefer `exact` / `possible` matches over creates.
   Yield/unit must look right (`gallons`, `qts`, `C` → cup).
4. **Do not** pass `--approve-new` for a bulk of unresolved lines without human
   OK. There is no pending-ingredient state — creates are **active** immediately.
5. Only after preview is clean (and human OK for any remaining news), enter:

```bash
bun run agent:enter-recipe -- path/to/recipe.txt --approve-new
```

6. Report preview summary (`exactMatchCount`, `unresolvedLineCount`,
   `wouldCreateIfApproved`) before asking to approve. If preview is wrong, stop.
7. Do not invent REST CRUD or edit generated `convex/mutations.ts`.

---

Enter without `--approve-new` only works when every line exactly matches the
ingredient catalog. Default is refuse-to-write on unresolved lines.
