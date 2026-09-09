# What Capsule tests must earn

Owner-requested working guidance, September 8, 2026. Read this when auditing or
writing tests. This records the owner's preference in the repository; it does
not change the existing rule against adding tests without an owner request.

A useful test distinguishes a correct, important behavior from a plausible
defect. It gives us confidence to change the program without breaking that
behavior. Passing tests, test counts and executed lines are evidence to assess,
not the objective.

- **Name the behavior and the failure.** Given an input or action, what result,
  state change or refusal should occur? What realistic bug would make this
  assertion fail? A function existing is generally already checked by its
  consumers and the compiler.
- **Exercise the production path appropriate to the claim.** A pure calculation
  needs a calculation test. A form-to-command claim needs the real form and its
  submitted payload. A persistence claim needs the real write path and a read
  of stored state. Finding a hook name in source proves none of those things.
- **Use an independent expected result.** Check the right IDs, amounts, units,
  dates and relationships. Count assertions are useful for duplication, but
  cannot distinguish two correct rows from two wrong rows. Do not compute the
  answer with the same production function being tested. Property tests are
  valid when the property rules out a meaningful defect.
- **Keep the behavior real when using doubles.** Substitute external services
  or controlled failure boundaries where useful. Do not mock the subject or
  implement its persistence inside a test helper and call that a backend test.
  Collaborator assertions are appropriate when their arguments or ordering are
  themselves an important boundary contract.
- **Make refusals informative.** Check the intended rejection reason and, when
  the claim includes safety or atomicity, unchanged relevant state. Include a
  valid counterpart where it prevents an always-rejecting implementation from
  passing. Test real harms, without inventing new product restrictions.
- **Allow behavior-preserving refactoring.** Prefer public inputs and outcomes
  over private names, call chains and source formatting. A source validator or
  public URL/schema contract can be valuable, but label its limited scope and
  test the validator with valid and invalid inputs. Blanket generated snapshots
  and strings found in comments are poor workflow evidence.
- **Keep tests isolated, predictable and proportionate.** Await asynchronous
  work; control clocks and shared state when relevant. Do not add one test per
  function, require a universal integration ratio, or chase a coverage quota.
  Consolidate repetitions that add no distinct boundary or observable result.
- **Challenge the assertion.** When assessing a suspicious test, try a small
  plausible defect in an isolated copy. Confirm the baseline passes and restore
  the original afterward. A surviving fault identifies a specific gap; a few
  selected faults do not yield a suite-wide mutation score.

The classification is **GOOD** for useful evidence at its actual scope,
**MIXED** for useful assertions with a material weakness or overstated claim,
and **POOR** for change detectors, redundant checks or unsupported behavior
claims that should be removed or replaced when authorized. These are engineering
judgments, not a percentage of the application that works.

## Research used

Both linked video transcripts were retrieved and read in full for this review.
The notes below are summaries, not transcript reproductions.

- [Ian Cooper: TDD, Where Did It All Go Wrong?](https://www.youtube.com/watch?v=EZ05e7EMOLM)
  — around [23:52](https://www.youtube.com/watch?v=EZ05e7EMOLM&t=1432s), he
  develops behavior and module contracts as the test boundary, rather than a
  test for every class or method. Around
  [35:01](https://www.youtube.com/watch?v=EZ05e7EMOLM&t=2101s), isolation concerns
  tests interfering with one another; it does not require mocking every
  collaborator. Around [45:05](https://www.youtube.com/watch?v=EZ05e7EMOLM&t=2705s),
  refactoring should preserve the existing behavioral contract and its tests.
- [Kent C. Dodds: Write tests. Not too many. Mostly integration.](https://www.youtube.com/watch?v=Fha2bVoC8SE)
  — around [3:24](https://www.youtube.com/watch?v=Fha2bVoC8SE&t=204s), coverage
  is easy to inflate and has diminishing returns. Around
  [6:22](https://www.youtube.com/watch?v=Fha2bVoC8SE&t=382s), tests become brittle
  when they act like consumers that do not actually exist. Around
  [12:29](https://www.youtube.com/watch?v=Fha2bVoC8SE&t=749s), integration is a
  useful confidence/cost balance, while unit tests still have a role. Around
  [15:45](https://www.youtube.com/watch?v=Fha2bVoC8SE&t=945s), mocking a connection
  removes the evidence that the real connection works.
- [Dodds: Testing implementation details](https://kentcdodds.com/blog/testing-implementation-details)
  explains the two failures of tightly coupled tests: breaking on harmless
  refactoring and passing when a user's interaction is broken.
- [Google: Change-detector tests](https://testing.googleblog.com/2015/01/testing-on-toilet-change-detector-tests.html)
  distinguishes requirements from tests that simply mirror implementation and
  demand synchronized edits.
- [Google: Test behavior, not implementation](https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html)
  favors observable contracts, while acknowledging that a deliberate performance
  or interaction requirement can justify checking an implementation interaction.
- [Martin Fowler: Test coverage](https://martinfowler.com/bliki/TestCoverage.html)
  treats coverage as a way to find neglected code, rather than a target that
  establishes quality.

## Capsule examples

- Good: draft invoices contribute zero billed revenue; stock equal to the
  reorder threshold does not trigger a low-stock alert; a rejected later write
  rolls back earlier writes.
- Mixed: copying a layout twice leaves two rows, but neither row's instructions
  are checked. Keep the duplication check and verify copied values.
- Poor: the quote start-time test finds `startTimeStr` in source yet passes when
  the form reads the end-time field as its start time.

See [the September 8 reassessment](test-audit-2026-09-08.md) and its complete
case inventory for the current evidence and limitations.
