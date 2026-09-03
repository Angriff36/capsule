<!-- Starting shape for one spec (specs/FILENAME.md) — one file per activity /
     topic of concern. Specs are the source of truth for what should be built.
     This is a MINIMUM, not a straitjacket: keep the four sections (they feed
     gap analysis and acceptance-driven backpressure) and add/reshape whatever
     else the activity needs. Delete this comment and the _italic_ guidance
     once filled in. One sentence without "and" describes the scope; if you
     need "and", it's probably two specs. -->

# [Activity / topic of concern]

_Serves JTBD(s):_ [which outcome(s) from AUDIENCE_JTBD.md this supports]

## Job Statement

What the user is trying to accomplish here, and why. Phrase as an outcome, not
a feature ("see the colors pulled from my photo", not "render a swatch grid").
One or two sentences.

## Acceptance Criteria

Observable, verifiable outcomes that define "done" — WHAT success looks like,
not HOW to build it. PLAN mode parses these into ACCEPTANCE_TESTS.md, so each
one must be checkable (behavior, performance, or edge case). Keep them
behavioral; leave implementation choices to Ralph.

- [ ] [Behavioral outcome — e.g. "extracts 5–10 dominant colors from any uploaded image"]
- [ ] [Performance outcome — e.g. "processes images <5MB in <100ms"]
- [ ] [Edge case — e.g. "handles grayscale, single-color, and transparent backgrounds"]
- [ ] [Subjective/perceptual, if any — e.g. "palette reads as balanced and usable" — needs LLM-as-judge review, see src/lib/llm-review.ts]

<!-- A criterion is good if you can imagine the test that fails when it's
     broken. "Works well" is not a criterion; "returns within 100ms" is. -->

## Out of Scope

What this spec deliberately does NOT cover — so gap analysis doesn't flag it as
missing and Ralph doesn't wander into it. Note where it belongs instead.

- [Excluded capability] — [future spec / different activity / not doing]

## Open Questions

Unresolved decisions that block or shape the work. Resolve before/while
building; Ralph can document new ones it discovers here.

- [Question] — [what's blocked until it's answered]
