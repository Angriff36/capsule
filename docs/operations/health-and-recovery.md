# Health and recovery (runbook)

PL-MONITORING / AC-165. The **System health** list at the top of Admin >
Integrations (managers only) names what is wrong right now and the next step.
The rules live in `src/lib/operationalHealth.ts`; proof
`tests/operational-health-classification.test.ts`. This page is the longer
version of each next step.

Every "Needs action" item except "server not answering" also shows in each
manager's notification bell on every screen, labelled "System health", and
opens this list (`convex/systemHealthNotices.ts`; proof
`tests/proofs/system-health-notices.runtime.test.ts`). "Check" items stay on
the list only.

The list reads only the manager's own company. It shows counts and states,
never provider error text, so no key, token or address reaches the screen.

## Alerts and what to do

| Alert | Meaning | Safe retry | Recovery |
| --- | --- | --- | --- |
| Server is not answering | The page lost the backend and cannot reconnect. | Reload after a few minutes. Typed forms are kept on the device (form drafts). | Restart the self-hosted backend on the production box; if it fails to start, redeploy the last release with `scripts/deploy-backend.sh --expect <release sha>` (see production-backend-deploy.md). |
| Server was set up by hand | `deploymentProbe:health` reports `unreleased`. | — | Run `bash scripts/deploy-production.sh` so the backend matches a release commit. |
| Screens and server from different releases | Page commit and backend release commit differ. Normal when the newer release changed screens only. | — | If buttons fail with "not found", the backend leg of the release did not finish: run the production release again (roll forward). |
| Messages stuck | A webhook, text or sign-in email has waited over 30 minutes. | Capsule retries by itself; nothing is lost while waiting. | Check the connection (Twilio, email sender, webhook receiver). |
| Capsule stopped trying | Delivery reached a final failure. These did not arrive. | Fix the cause, then use Try again in the Webhooks list (webhooks) or send again from where it started (texts, sign-in emails). | — |
| Not sure it arrived | The send may have reached the other side before the answer was lost. | **Do not resend blindly.** Ask the recipient or check the other system first. | Resend only when it surely did not arrive. |
| Google Calendar needs connecting again | Google refused Capsule's access. | Connect again; events catch up by themselves. | — |
| Some events did not reach Google Calendar | Single events were refused. | Retry each event from the Google Calendar list. | — |
| QuickBooks needs connecting again | QuickBooks refused Capsule's access. | Disconnect and connect again. | — |
| Last QuickBooks run did not send everything | Some items failed. | Sync now; items already in QuickBooks are skipped, not sent twice. | — |

## Rollback and roll forward

- **Screens (Vercel):** a bad screen release is fixed by releasing a fixed
  commit (roll forward). Older screens also work against a newer backend only
  when no function they call was removed, so roll forward is the default.
- **Backend (production box):** redeploy a known release commit with
  `scripts/deploy-backend.sh --expect <sha>`. The database is not rolled back
  by a code deploy; data written by the newer code stays.

## Things a code rollback cannot undo

These left Capsule and live on in other systems. Rolling back code does not
take them back; fix them in the other system or by hand:

- emails sent (proposals, vendor orders, staff summaries, sign-in emails)
- text alerts sent
- webhooks delivered to outside systems
- events written to Google Calendar
- invoices, customers and payments written to QuickBooks
- payment links already opened or paid

## Not built yet

- A paging alert (text or email to a named person) when an "act" item appears.
  Who receives it is an open question in
  specs/ralph/production-13-release-recovery.md.
- The recovery drill (break a disposable backend, see the alert, recover,
  record the times) needs a disposable production-like backend.
