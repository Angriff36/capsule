# Findings: Lead pipeline CRM

## Initial state

- Active branch is `main`.
- The checkout already contains a very large set of modified and untracked files, including the current sales Manifest sources, clients UI, app routing/navigation, generated bindings, diagrams, and shared styles.
- Existing standard planning files belong to a payroll-export task, so this feature uses an isolated planning subdirectory.
- No task-specific lead/pipeline memory entry was found; implementation decisions will come from the live checkout.

## Requirements

- Add a Lead representing a prospective client inquiry before formal Contact/Proposal creation.
- Track source, estimated value, stage (`new`, `qualified`, `proposal-sent`, `negotiating`), and probability.
- Give sales staff a usable pipeline view.
- Preserve existing patterns, generated ownership, and unrelated work.
- Verify core behavior through a temporary Playwright test, then remove it.

## Domain and UI discovery

- `src/app.manifest` is the single root entry and imports sales modules directly; a Lead module must be added there rather than daisy-chained through another sales file.
- `ClientContact` is downstream of a durable `Client` and therefore cannot represent a pre-client inquiry by itself.
- `Proposal` currently requires a durable `Client` and has lifecycle stages `draft`, `sent`, `viewed`, `accepted`, `declined`, and `expired`.
- Existing commercial entities use `TenantScoped`, `SoftDeletable`, optimistic versions, `salesAccess` read/write/execute policies, explicit creation commands, lifecycle events, and durable storage.
- The requested Lead stages do not justify extra approval/role guards; normal sales access and simple lifecycle commands match the repository's domain-gating restraint.
- `/clients` is already the shipped CRM area, with proposal and contract subroutes; a pipeline route belongs under this workspace rather than as a new top-level navigation area.
- The app uses Archivo Variable for product typography, small editorial panels, warm neutral tokens, and compact operational density. The pipeline should extend that language rather than importing a new visual system.
- `package.json` uses Bun for project commands and has no Playwright dependency; temporary verification can use the installed CLI through `bunx`, honoring the explicit user request for a test file.
- The Client entity lives in `src/operations/event.manifest` and represents the formal account. Its `register` command already captures company/person identity and contact facts, so Lead conversion should link to a created Client instead of duplicating formal-account behavior.
- `ClientsWorkspaceNav` is a direct projection of `CLIENTS_SECTIONS`; adding a pipeline entry to that route catalog will expose the new workspace tab consistently.
- Existing client route tests are authored and currently assert exactly accounts/proposals/contracts. Repository instructions prohibit expanding permanent tests, so feature verification will remain temporary and focused.
- Generated client UI uses `useCreate<Entity>`, `useList<Entity>`, and command hooks such as `useProposalSend`, all imported from `src/lib/manifest-convex-react`; the Lead page should use the same generated seam after Builder regeneration.
- `CrmLifecyclePolicy` is generated-metadata driven for existing lifecycle actions. A Lead page can either extend it after generation or keep stage movement explicit if generated transition exports do not fit a simple probability-edit workflow.
- Current edits in `src/app.manifest`, `src/app/App.tsx`, `src/features/clients/ProposalsPage.tsx`, `src/features/clients/clientsRoutes.ts`, and `src/styles/app.css` are substantial unrelated feature work and must be preserved line-for-line around any narrow additions.
- The proposal page already follows a dense operational pattern: generated hooks, local busy/failure/notice state, one authored form, workspace navigation, and a compact result table.
- No Lead, pipeline, probability, or existing lead-stage source was found in authored files; this is a new domain slice rather than completion of a partial implementation.
- The likely shared route/style files remained byte-stable across a three-second quiet interval, so narrow additions are currently safe; hashes must be checked again immediately before editing.
- Proven upstream/downstream entities keep optional downstream IDs and explicit refs on the upstream record. Lead can therefore own optional `clientId`, `clientContactId`, and `proposalId` links without forcing new fields into the already modified Contact/Proposal sources.
- Pipeline stage changes should be reversible: catering inquiries commonly move backward during negotiation, and a one-way transition graph would add tedium without protecting money. A single validated `updatePipeline` command is the restrained model.
- Builder regenerated the Lead table, tenant/search indexes, encrypted email/phone storage, list/get hooks, governed capture hook, and all command hooks with zero assembly errors or conflicts.
- Generated `confirmConversion` resolves Client and ClientContact through tenant-scoped relations before validating active/account ownership.
- Generated `confirmProposalSent` resolves Proposal tenant-scoped; the authored guard now also requires Proposal status `sent`, preventing a draft from being mislabeled as proposal-sent in the pipeline.
- Governed creation returns `{ docId }`; update commands return the updated record and version, so the UI can chain staged-link and confirmation commands with optimistic concurrency.
- The UI keeps the existing exact `CLIENTS_SECTIONS` test contract intact by defining the pipeline as a separate workspace section composed into `ClientsWorkspaceNav`; no permanent test was expanded.
- Proposal creation is explicit and accurately named: the button drafts and sends the Proposal, then links it to the Lead. The domain confirmation refuses to label a draft as `proposalSent`.
- The first disposable build accidentally bundled the real Convex hook module because Vite aliases raw import specifiers before resolved absolute paths; the exact relative import must be aliased for the harness.
- The final browser proof used the real route component and CSS, with only generated network hooks mocked. It observed correct stage rendering, capture, `$12,000 × 25% = $3,000`, update to `$18,000 × 60% = $10,800`, explicit conversion, and sent-proposal linking.
