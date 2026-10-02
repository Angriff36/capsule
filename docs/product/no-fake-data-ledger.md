# No fake data, no dead buttons — sweep ledger

Spec: `specs/ralph/no-fake-data-or-dead-buttons.md` (AC-054). Route plan item:
PL-ROUTE-STATES.

## Sweep 2026-10-03

Three read-only searches covered every shipped screen area under
`src/features/**`, `src/app/**`, `src/ui/**` and the authored `convex/*.ts`
files they call. They looked for: made-up numbers or rows shown as real, enabled
buttons that do nothing, generated command calls with `id` in place of `docId`,
writes left "queued" with no sender, and loops of writes that hide a stop part
way. Input placeholders and local-only screen state do not count.

Each finding is either **fixed** (commit named) or a **plan task** (what is
still to build). Nothing is left silent.

| # | Where | What was wrong | Result |
| - | ----- | -------------- | ------ |
| 1 | Email summaries page (`/settings/email`) | Said summaries reach your inbox; nothing sends them | Fixed: page says they are not sent yet; counter "turned on"; preview labelled an example. Plan task: build the staff summary sender (below) |
| 2 | Email summaries preview | Made-up event, invoice and stock shown with no label | Fixed: labelled "Example email, made-up details" |
| 3 | Reports: acceptance rate, completion rate, TPP profit % | Showed 0% when there was nothing to count | Fixed: "Not known yet" |
| 4 | Home: Today and Week ahead counts | Counted only the first 8 events shown; "week" was not 7 days | Fixed: counted over all live events; "Coming up · N in the next 7 days" |
| 5 | Leftover import items: bulk Check / Skip | One failure hid how many went through | Fixed: every item tried, failures stay selected, counts shown |
| 6 | Catalogs "Add standard list" | Stop part way gave no count | Fixed: "Added k of n" |
| 7 | Event create "Add the standard list" (service styles) | Failure swallowed | Fixed: message under the button |
| 8 | Tracker "Number events" | Stop part way gave no count | Fixed: shared bulk runner counts |
| 9 | Announcement close (X) | Failure swallowed; X did nothing | Fixed: hides at once, message if not saved |
| 10 | Assistant file drop | Only the last failed file named | Fixed: every failed file named |
| 11 | Saved views | Every failure said "Couldn't save your view" | Fixed: names the action and the reason |
| 12 | Invoice "Send balance reminder" | Sends nothing, only notes it | Fixed: renamed "Note balance reminder" |
| 13 | Vendor orders "Submit" / "Sent to the vendor" | Capsule sends nothing to the vendor | Fixed: "Mark sent"; text says to send it yourself. Plan task: send the order to the vendor by email (below) |
| 14 | New prep task with "wait for" links | Link failure left the form open; a second press made a second task | Fixed: form closes once saved; says how many links saved |
| 15 | Roster "Publish week" | Stop part way gave no count | Fixed: shared bulk runner counts |
| 16 | Opening stock CSV import | Count lost on a later chunk failure | Fixed: count in the error |
| 17 | Kitchen catalog cleanup Apply | Batch failure lost the counts | Fixed: counts and "not tried yet" in the error |
| 18 | Equipment bulk add | Count not shown on a stop | Fixed: "Added k of n" |
| 19 | Event-day background alerts switch | Start failure went nowhere | Fixed: message next to the switch |
| 20 | Approval threshold / stock return prompts | Bad input did nothing | Fixed: says what to enter |
| 21 | `importCoordinator` commit / revert (no screen calls them) | Marked runs completed / reverted with nothing saved or undone | Fixed: they refuse and point to the real import page steps (`importCommit.ts`) |

Checked clean: no `id` in place of `docId` in any generated command call; every
navigation link has a route; no button only logs or only shows a toast; webhook,
SMS, chat, proposal and invoice sends are real or say "not sent"; no lorem,
sample or random data in shipped code (demo values live only in stories).

Not counted (owner rules): payroll and pay screens (timesheet "Approve all",
pay rates, tip payroll inputs), Stripe, QuickBooks, commission. A developer
self-check in `src/features/kitchen/componentSnapshot.ts` is never called and
shows nothing to users.

## Plan tasks from this sweep

- **Staff email summaries** (event updates, invoice follow-ups, low stock, shift
  changes): build a sender that reads each person's saved choices on
  `/settings/email` and emails real summaries. Needs the email account
  (`RESEND_API_KEY`, sender address) on the deployment; production has none yet.
- **Vendor order email**: optional "Email this order to the vendor" on a vendor
  order, using the vendor contact's email. Same email account need.
