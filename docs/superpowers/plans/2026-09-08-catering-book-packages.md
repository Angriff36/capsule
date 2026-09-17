# Catering book packages

Goal: Select offerings from the four supplied Mangia books on an event, choose
the included options and servings, and create the selected dishes and prep work.
The supplied TPP video is the behavioral reference. Dishes are recipes in the
operator's vocabulary.

Architecture: A source-attributed catalog supplies reusable package definitions.
The event picker previews editable selections. An authenticated Convex transaction
uses existing Manifest commands to reuse/create dishes, attach preparation
templates where absent, and add event dishes. Existing reactions create prep and
ingredient demand. A durable receipt prevents a retried request duplicating work.
Existing recipe quantities and procedures are preserved; brochure descriptions
are retained without inventing measured ingredient quantities or cooking times.

1. Extract and verify catalog entries against the PDFs, preserving choice groups,
   service notes, book editions, and page references.
2. Implement the package transaction using authored Convex seams and generated
   commands. Keep tenancy and replay protection aligned with existing operations.
3. Add an event-menu package picker using DESIGN.md tokens and ordinary form
   controls. Show selections, servings, and source notes before applying.
4. Run existing checks and verify the complete package-to-event-to-prep flow.
   No new tests: the owner's explicit test restriction applies.

No generated files are hand-edited. Work is on feat/catering-book-packages;
no deployment commands or main push are part of local implementation.
