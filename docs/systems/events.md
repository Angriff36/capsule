# Events

> Owns the CapsuleX operator experience for Client, Venue, Event, and EventGuest. Commercial documents and client contacts are owned by [commercial-billing.md](commercial-billing.md).

## Purpose and shipped outcome

Events turns a client engagement into the governed event plan used by downstream operations. The Event Planning Foundation is a verified operator workflow: an authorized user can select or create a Client and Venue, create an Event, land on its dossier, revise its core planning facts, manage guests, and move the Event through every lifecycle action currently exposed by the generated contracts.

This is not a broad CRM, venue-management suite, readiness dashboard, or replacement for the downstream Culinary, Workforce, Logistics, Commercial, and Closeout workspaces.

## Owned domain

| Canonical source                                            | Entities                         | Operator meaning                                                                         |
| ----------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| `C:\projects\Manifest-source\src\operations\event.manifest` | Client, Venue, Event, EventGuest | Engagement account, reusable venue, governed event plan/lifecycle, individual attendance |

Manifest source owns business rules. Capsule provides the operator workflow through generated Convex queries, commands, policies, guards, constraints, lifecycle metadata, and authored integration seams.

## Routes and workspace

| Route         | Surface       | Shipped behavior                                                                                                    |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `/events`     | Event index   | Loading skeleton, empty/filter-empty states, stage counts, stage filtering, title/client/venue search, date sorting |
| `/events/new` | Event create  | Client and Venue selection/inline creation, complete planning form, categorized command failures                    |
| `/events/:id` | Event dossier | Planning revisions, legal lifecycle actions, guest attendance workflow, unavailable/denied-safe record state        |

The index displays only real query results. Each row shows Event title, Venue, Client, start date, headcount, budget, and lifecycle stage. Clicking a row opens its real dossier; there are no fake KPIs or placeholder records.

## Create an Event

The create page requires an active registered Client and Venue. Existing records are selectable. If no suitable record exists, the user can create one without leaving the Events workspace.

### Inline Client creation

- Client type: company or person.
- Company name, or given/family name as appropriate.
- Optional email and phone.
- The current focused UI initializes payment terms to `0` days and tax-exempt to `false`; broader account maintenance is not exposed here.

### Inline Venue creation

- Name, type, and capacity.
- Optional street address, city, region, and postal code.
- Supported generated types: client site, banquet hall, outdoor, office, private home, and other.

### Event planning facts

- Client and Venue.
- Title and Event type.
- Start and end date/time.
- Expected headcount.
- Primary contact name, email, and phone.
- Budget and quoted price.
- Accessibility, service, and operational requirements.

The browser converts the entered local date/time into an epoch timestamp and displays it in the operator's browser timezone. Venue-specific timezone behavior is not implemented.

Creation uses the actual `Client.register`, `Venue.register`, and `Event.planEngagement` generated commands. The authored action seam allocates the instance ID those contracts require, invokes the generated command, and removes the allocation if the command rejects. A successful Event command navigates directly to `/events/:id`.

## Event dossier and revisions

The dossier shows the Event identity and stage plus real schedule, service, commercial, contact, requirements, and guest facts. It exposes these generated revision commands:

| Planning area   | Generated command            | Editable lifecycle state                                                             |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------ |
| Schedule        | `Event.reschedule`           | Planning, pending approval, approved                                                 |
| Venue           | `Event.changeVenue`          | Planning, pending approval, approved                                                 |
| Headcount       | `Event.changeHeadcount`      | Planning, pending approval, approved, executing                                      |
| Pricing         | `Event.changePricing`        | Planning, pending approval, approved; management and sales-management policies apply |
| Primary contact | `Event.changePrimaryContact` | Planning, pending approval, approved                                                 |
| Requirements    | `Event.changeRequirements`   | Planning, pending approval, approved                                                 |

All writes include the current generated version when available. A stale version is rendered as a conflict rather than silently overwriting another operator's change.

Material revisions do not automatically return an approved Event to planning or require renewed approval. Title, Event type, Client, and owner reassignment are not editable in the current dossier. `Event.assignOwner` exists in generated capability metadata but is not yet exposed by this UI.

## Lifecycle

Action availability comes from generated lifecycle transition metadata. React does not maintain a separate transition table.

| Current stage    | Available actions                           | Resulting stage                             |
| ---------------- | ------------------------------------------- | ------------------------------------------- |
| Planning         | Submit for approval; cancel                 | Pending approval; cancelled                 |
| Pending approval | Return to planning; approve; cancel         | Planning; approved; cancelled               |
| Approved         | Return to planning; begin execution; cancel | Planning; executing; cancelled              |
| Executing        | Complete; cancel                            | Completed; cancelled                        |
| Completed        | Close out                                   | Closed out                                  |
| Cancelled        | None                                        | Terminal in the current generated lifecycle |
| Closed out       | None                                        | Terminal                                    |

Return-to-planning and cancellation require a reason. Approve, return, complete, closeout, cancellation, and pricing commands remain subject to generated management policies even when a lifecycle transition exists. A server-side denial or guard failure is displayed to the user.

## Guests

The dossier lists only active invited guests for the current Event. Each record can show contact, RSVP state, check-in time, table assignment, dietary/allergen/accessibility needs, and special-meal status.

### Invite

`EventGuest.invite` supports:

- Name, email, and phone.
- Dietary restrictions.
- Allergen restrictions.
- Accessibility needs.
- Special-meal requirement.

Invitation uses the same allocate/invoke/cleanup seam as Event creation. The generated projector permits the creation command to reassert its preallocated initial `pending` RSVP value; changing to a different value still requires a legal lifecycle transition.

### Attendance actions

| Action       | Generated command        | Current availability                                                    |
| ------------ | ------------------------ | ----------------------------------------------------------------------- |
| Confirm RSVP | `EventGuest.rsvpConfirm` | Pending or already confirmed guest                                      |
| Decline RSVP | `EventGuest.rsvpDecline` | Pending or confirmed guest; reason is optional                          |
| Check in     | `EventGuest.checkIn`     | Confirmed, active guest not already checked in                          |
| Assign table | `EventGuest.assignTable` | Active guest whose RSVP is not declined; non-empty table value required |
| Withdraw     | `EventGuest.withdraw`    | Active guest; non-empty reason required                                 |

The UI disables actions from generated lifecycle/capability state and the guest's current record. The generated command is still authoritative: any denied, guard-blocked, invalid, or conflicting request is shown rather than treated as success.

## Loading, empty, access, and failure behavior

- Lists and dossiers show skeletons while generated queries are unresolved.
- The index distinguishes a genuinely empty workspace from a filter with no matches.
- An unreadable, deleted, or missing Event renders a non-enumerating “Event unavailable” state.
- Signed-in users without a usable role or tenant are stopped by the authored authentication gate before the workspace.
- Command failures are categorized as denied, validation, guard-blocked, conflict, or unexpected and render in an alert banner.
- Busy actions are disabled until the command settles; failures remain visible with a useful description.

## Authorization and data handling

- Tenant and role come from the verified Clerk identity in `C:\projects\capsule\convex\lib\authContext.ts`; client input cannot select a tenant.
- Generated queries and mutations enforce tenant ownership and role policies.
- Client, Event contact, and EventGuest contact fields use the generated encryption seam and require `CONVEX_FIELD_ENCRYPTION_KEY` in the Convex deployment.
- UI reads and writes use generated hooks from `C:\projects\capsule\src\lib\manifest-convex-react.ts` and API exports from `C:\projects\capsule\src\lib\api.ts`.
- Generated files remain regeneration-owned and are not hand-edited.

## Cross-system boundary

The Event foundation executes the generated legal approve and cancel actions, including the reached fan-out payload projection fix. It does not claim that every downstream demand, reservation, preparation, delivery, invoice, or closeout consequence has been verified end to end. Those facts and workflows belong to their owning system pages and become public capacity only when their slices are implemented and exercised.

No linked-system readiness summaries are currently rendered in the Event dossier.

## Real-world example

An event manager can select the Northstar Events Client and Harborview Loft Venue, create “Northstar Summer Gala,” and land directly on its dossier. They can revise the schedule, headcount, Venue, pricing, primary contact, and service brief; submit and approve the Event when authorized; invite Avery Brooks; confirm the RSVP; assign Table 4; check the guest in; and see any generated guard, validation, authorization, or concurrency failure inline.

## Implementation and proof

| Concern                    | Current implementation path                                                    |
| -------------------------- | ------------------------------------------------------------------------------ |
| Index                      | `C:\projects\capsule\src\features\events\EventsListPage.tsx`                   |
| Creation                   | `C:\projects\capsule\src\features\events\EventCreatePage.tsx`                  |
| Dossier and lifecycle      | `C:\projects\capsule\src\features\events\EventDetailPage.tsx`                  |
| Guest workflow             | `C:\projects\capsule\src\features\events\EventGuestPanel.tsx`                  |
| Lifecycle/capability offer | `C:\projects\capsule\src\features\events\EventLifecyclePolicy.ts`              |
| Failure classification     | `C:\projects\capsule\src\features\events\CommandFailure.ts`                    |
| Creation action seam       | `C:\projects\capsule\convex\lib\eventPlanning.ts`                              |
| Focused foundation proof   | `C:\projects\capsule\tests\event-planning-foundation.test.ts`                  |
| Auth/encryption proof      | `C:\projects\capsule\tests\event-seam-contract.test.ts` and `tests\event-seam` |
| Reaction projection proof  | `C:\projects\capsule\tests\event-reaction-projection.test.ts`                  |

The focused foundation suite covers generated create-command wiring, direct detail navigation, lifecycle offers, guest operations, and distinct failure rendering. The generated contract suite additionally protects the command surface.
