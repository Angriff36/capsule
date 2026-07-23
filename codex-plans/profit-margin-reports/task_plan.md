# Profit Margin Reports — Task Plan

## Goal

Implement profit-margin reporting that combines event revenue with food, labor, equipment, and overhead costs; supports event, client, and time-period analysis; identifies strongest and weakest client segments; and exports the current report as CSV.

## Constraints

- Preserve all unrelated dirty work in the shared checkout.
- Do not hand-edit generated or Builder-owned files.
- Do not add permanent tests; use a temporary Playwright verification spec and remove it afterward.
- Follow existing finance/reporting and routing patterns.
- Run focused verification and `bun run check` before completion.

## Phases

1. **Explore current reporting/domain seams** — complete
2. **Choose a bounded implementation design** — complete
3. **Implement authored source/UI changes** — complete
4. **Run focused static verification** — complete
5. **Run temporary Playwright verification and remove spec** — complete
6. **Run required repository gate and archive plan** — pending (blocked by active concurrent checkout writer)

## Decisions

- Planning artifacts are isolated in this feature directory because shared root planning files already contain unrelated active work.
- Use finalized closeouts as the sole revenue/cost snapshot, aggregate in a pure authored TypeScript module, and render a fixture-friendly dashboard component backed by generated list hooks in the live page.
- Define client segments from the only modeled segmentation field: company vs person.
- Add a new `/finance/profit-margins` route and finance workspace link.
- Keep styles in a feature-local CSS file.
- Export the active event/client/period table rather than a hidden all-data shape, so the CSV matches what the user is analyzing.

## Errors Encountered

- A combined PowerShell exploration command exited with code 1 and no output, likely from mixed quoting/globbing. Split into simpler literal commands rather than retrying the same shape.
- The first hidden Vite launch used the `bun` PowerShell shim with `Start-Process`, which is not a Win32 executable. Retry with the resolved `bun.exe` binary instead.
- `bun.exe` is not directly discoverable on PATH even though the `bun` command works. Inspect the shim target and launch the underlying executable or a hidden PowerShell host.
- Temporary Playwright verification attempt 1 loaded no dashboard heading. Inspect the captured page/error and Vite logs before changing implementation or rerunning.
- Attempt 2 still rendered blank after adding router context, so the initial diagnosis was incomplete. Capture browser console/page errors on the next run rather than guessing again.
- A diagnostic logging patch initially targeted `profit-margin-reports/progress.md` instead of the isolated `codex-plans` path and was rejected without changing files. Corrected the patch target.
- The final `bun run check` was not started because another Capsule session was actively writing the shared checkout seconds before the gate. Repository rules require stopping rather than racing concurrent edits.
