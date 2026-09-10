# Source-backed event timing

Source: Mangia Ops Final Lock Training, page 4 (Timeline). Full-service setup
is 180 minutes; limited service is 90. The worked example is service 11:30,
onsite 08:30, departure 08:00 with checked 30-minute travel, and staff on 07:00
with a 60-minute load. Larger loads need a longer window. Cleanup/reload is
typically 60 minutes after event end; actual return travel and shop unloading
complete the staff-off calculation. Unknown travel must not be estimated.

Implementation extends the existing Event and EventTimelineActivity commands.
Event stores an explicit service start and six editable duration inputs. It
owns the calculated milestone times in Manifest. The Timeline tab reuses a
single recorded Buffet Open/service-start block when present and proposes the
source setup/load/cleanup values as editable starting values. Unknown inputs
remain null; they do not prevent saving the rest of the plan. Event startsAt
is not silently interpreted as service start. Explicit service time shifts by
the event-start delta on rescheduling, so a chosen offset survives a date move.

The event command callback reconciles eight shared blocks in its transaction:
staff on/loading, shop departure/travel, onsite arrival/setup, service start,
cleanup/reload, venue departure/return, shop arrival/unloading, and staff off.
Unique matching existing blocks are linked, preserving their names, notes,
assignments and times. Ambiguous matches are reported rather than duplicated.
Unedited calculated blocks follow new timing inputs. Manual time changes and
performed work remain intact, including after reopen. Removed blocks remain
removed. A manual block can explicitly resume calculated timing; completed or
previously performed work cannot be silently rewritten by that action.

Validation uses the actual generated runtime with the source worked example,
limited service, missing travel, retry/rollback, rescheduling, manually edited,
completed/reopened and removed blocks, and tenant/role/version exclusions.
Use existing repository tests, full check, independent cross-model review and
desktop/mobile keyboard qualification. No new authored tests are authorized.

This is part of issue 353. Purchasing, source/data repairs, complete staffing
and report workflows, print, release and authenticated production verification
remain required by the full goal.
