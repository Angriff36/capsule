import { useState, type FormEvent } from "react";
import {
  useCreateOneOnOne,
  useCreateOneOnOneAction,
  useListOneOnOne,
  useListOneOnOneAction,
  useListPerson,
  useOneOnOneActionClose,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { CHIP_TONE_CLASS } from "../../lib/statusLabels";
import { formatCountNoun, formatDate } from "../../lib/format";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";

// goals/decisions are JSON string arrays on the entity (additive shape, like
// RoleScorecard.expectations) so the captured lists can grow without a schema
// migration.
function parseStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((row): row is string => typeof row === "string")
      : [];
  } catch {
    return [];
  }
}

function localDateEpoch(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "");
  if (!text) return undefined;
  return new Date(`${text}T12:00:00`).getTime();
}

export function OneOnOnesPage() {
  const meetings = useListOneOnOne();
  const actions = useListOneOnOneAction();
  const people = useListPerson();
  const holdMeeting = useCreateOneOnOne();
  const captureAction = useCreateOneOnOneAction();
  const closeAction = useOneOnOneActionClose();

  const [open, setOpen] = useState(false);
  const [staffDraft, setStaffDraft] = useState("");
  const [goals, setGoals] = useState<string[]>([""]);
  const [decisions, setDecisions] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const activePeople = (people ?? []).filter(
    (row) => row.deletedAt == null && row.status === "active",
  );
  const personName = (id: string | null | undefined) => {
    if (!id) return "—";
    const person = people?.find((row) => row._id === id);
    return person
      ? `${person.givenName} ${person.familyName}`.trim()
      : "Unknown";
  };

  const heldMeetings = (meetings ?? [])
    .filter((row) => row.deletedAt == null && row.heldAt != null)
    .sort((a, b) => (b.meetingDate ?? 0) - (a.meetingDate ?? 0));
  const liveActions = (actions ?? []).filter((row) => row.deletedAt == null);

  // "Open actions appear in the next meeting" (spec §9.5): surface the
  // still-open follow-ups from the selected staff member's PRIOR meetings —
  // matched by the meeting's id, not by action owner (a follow-up from their
  // meeting may be owned by the manager or another participant).
  const priorMeetingIds = new Set(
    heldMeetings
      .filter((meeting) => meeting.staffMemberId === staffDraft)
      .map((meeting) => meeting._id),
  );
  const priorOpenActions = staffDraft
    ? liveActions.filter(
        (row) => priorMeetingIds.has(row.oneOnOneId) && row.status === "open",
      )
    : [];

  const startNew = () => {
    setStaffDraft("");
    setGoals([""]);
    setDecisions([""]);
    setOpen(true);
  };

  const updateRow = (
    list: string[],
    set: (next: string[]) => void,
    index: number,
    value: string,
  ) => set(list.map((row, i) => (i === index ? value : row)));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFailure(null);
    setBusy(true);
    void (async () => {
      try {
        await holdMeeting({
          leadPersonId: String(data.get("leadPersonId")),
          staffMemberId: String(data.get("staffMemberId")),
          meetingDate: localDateEpoch(data.get("meetingDate")) ?? 0,
          agenda: String(data.get("agenda") || ""),
          goals: JSON.stringify(goals.filter((row) => row.trim())),
          wins: String(data.get("wins") || ""),
          opportunities: String(data.get("opportunities") || ""),
          decisions: JSON.stringify(decisions.filter((row) => row.trim())),
        });
        form.reset();
        setOpen(false);
        setGoals([""]);
        setDecisions([""]);
        setStaffDraft("");
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  const addAction = (event: FormEvent<HTMLFormElement>, meetingId: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFailure(null);
    void (async () => {
      try {
        await captureAction({
          oneOnOneId: meetingId,
          ownerPersonId: String(data.get("ownerPersonId")),
          description: String(data.get("description") || ""),
          dueDate: localDateEpoch(data.get("dueDate")),
        });
        form.reset();
      } catch (error) {
        setFailure(error);
      }
    })();
  };

  const handleClose = async (actionId: string) => {
    setFailure(null);
    try {
      await closeAction({ docId: actionId });
    } catch (error) {
      setFailure(error);
    }
  };

  const loading = meetings === undefined || people === undefined;

  return (
    <div className="operations-stage">
      <header className="training-masthead">
        <div>
          <p className="eyebrow">Staff · One-on-Ones</p>
          <h1 className="display-title mt-2">
            Recurring conversations, captured and carried forward.
          </h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Record each one-on-one — agenda, goals, wins, opportunities, and
            decisions — then track follow-up actions by owner and due date. Open
            actions roll into the next meeting, and closing one never rewrites
            the prior record.
          </p>
        </div>
        <div aria-label="One-on-one actions">
          <button
            className="btn btn-primary"
            onClick={() => (open ? setOpen(false) : startNew())}
          >
            {open ? "Close" : "New one-on-one"}
          </button>
        </div>
      </header>

      <WorkforceWorkspaceNav />
      {failure ? <WorkforceFailureBanner error={failure} /> : null}

      {open ? (
        <form className="supply-form" onSubmit={submit}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">One-on-one</p>
              <h2>Hold a one-on-one</h2>
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Hold meeting"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Lead (manager)
              <select name="leadPersonId" className="input" required>
                <option value="">Select lead</option>
                {activePeople.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.givenName} {person.familyName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Staff member
              <select
                name="staffMemberId"
                className="input"
                required
                value={staffDraft}
                onChange={(e) => setStaffDraft(e.target.value)}
              >
                <option value="">Select staff member</option>
                {activePeople.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.givenName} {person.familyName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Meeting date
              <BoundedDateInput name="meetingDate" className="input" required />
            </label>
            <label className="field-label col-span-2">
              Agenda
              <textarea
                name="agenda"
                className="input"
                rows={2}
                placeholder="Topics for this conversation"
              />
            </label>
            <div className="field-label col-span-2">
              Goals
              <div className="flex flex-col items-start gap-2">
                {goals.map((row, index) => (
                  <div
                    key={index}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-2"
                  >
                    <input
                      className="input"
                      placeholder="Goal for this period"
                      value={row}
                      onChange={(e) =>
                        updateRow(goals, setGoals, index, e.target.value)
                      }
                    />
                    {goals.length > 1 ? (
                      <button
                        type="button"
                        className="btn-link btn-link-compact text-ink-2"
                        onClick={() =>
                          setGoals(goals.filter((_, i) => i !== index))
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setGoals([...goals, ""])}
                >
                  + Add goal
                </button>
              </div>
            </div>
            <label className="field-label col-span-2">
              Wins / strengths
              <textarea
                name="wins"
                className="input"
                rows={2}
                placeholder="What went well"
              />
            </label>
            <label className="field-label col-span-2">
              Areas of opportunity
              <textarea
                name="opportunities"
                className="input"
                rows={2}
                placeholder="Where to grow"
              />
            </label>
            <div className="field-label col-span-2">
              Decisions
              <div className="flex flex-col items-start gap-2">
                {decisions.map((row, index) => (
                  <div
                    key={index}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-2"
                  >
                    <input
                      className="input"
                      placeholder="Decision recorded"
                      value={row}
                      onChange={(e) =>
                        updateRow(
                          decisions,
                          setDecisions,
                          index,
                          e.target.value,
                        )
                      }
                    />
                    {decisions.length > 1 ? (
                      <button
                        type="button"
                        className="btn-link btn-link-compact text-ink-2"
                        onClick={() =>
                          setDecisions(decisions.filter((_, i) => i !== index))
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setDecisions([...decisions, ""])}
                >
                  + Add decision
                </button>
              </div>
            </div>
          </div>

          {priorOpenActions.length > 0 ? (
            <div className="ledger-heading mt-6">
              <div>
                <p className="eyebrow">Carried forward</p>
                <h2>Open actions from prior meetings</h2>
              </div>
            </div>
          ) : null}
          {priorOpenActions.length > 0 ? (
            <div className="supply-table-wrap">
              <table className="supply-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Owner</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {priorOpenActions.map((row) => (
                    <tr key={row._id}>
                      <td>{row.description}</td>
                      <td>{personName(row.ownerPersonId)}</td>
                      <td>{formatDate(row.dueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="supply-form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setOpen(false);
                setStaffDraft("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : heldMeetings.length === 0 ? (
        <section className="working-ledger">
          <div className="document-empty">
            <p>No one-on-ones held yet.</p>
            <span>Hold a meeting to start capturing the conversation.</span>
          </div>
        </section>
      ) : (
        <section className="working-ledger">
          <div className="ledger-heading">
            <div>
              <p className="eyebrow">One-on-one ledger</p>
              <h2>Held meetings</h2>
            </div>
            <span>{formatCountNoun(heldMeetings.length, "record")}</span>
          </div>
          {heldMeetings.map((meeting) => {
            const meetingActions = liveActions.filter(
              (row) => row.oneOnOneId === meeting._id,
            );
            const openCount = meetingActions.filter(
              (row) => row.status === "open",
            ).length;
            const goalList = parseStringList(meeting.goals);
            const decisionList = parseStringList(meeting.decisions);
            return (
              <div key={meeting._id} className="supply-form mt-4">
                <div className="supply-form-heading">
                  <div>
                    <p className="eyebrow">{formatDate(meeting.meetingDate)}</p>
                    <h2>
                      {personName(meeting.staffMemberId)} ↔{" "}
                      {personName(meeting.leadPersonId)}
                    </h2>
                  </div>
                  <span>
                    {meetingActions.length} action
                    {meetingActions.length === 1 ? "" : "s"}
                    {openCount > 0 ? ` · ${openCount} open` : ""}
                  </span>
                </div>
                <div className="supply-form-grid">
                  {meeting.agenda ? (
                    <p className="col-span-2">
                      <strong>Agenda:</strong> {meeting.agenda}
                    </p>
                  ) : null}
                  {goalList.length ? (
                    <p className="col-span-2">
                      <strong>Goals:</strong> {goalList.join(" · ")}
                    </p>
                  ) : null}
                  {meeting.wins ? (
                    <p className="col-span-2">
                      <strong>Wins:</strong> {meeting.wins}
                    </p>
                  ) : null}
                  {meeting.opportunities ? (
                    <p className="col-span-2">
                      <strong>Opportunities:</strong> {meeting.opportunities}
                    </p>
                  ) : null}
                  {decisionList.length ? (
                    <p className="col-span-2">
                      <strong>Decisions:</strong> {decisionList.join(" · ")}
                    </p>
                  ) : null}
                </div>

                {meetingActions.length > 0 ? (
                  <div className="supply-table-wrap mt-4">
                    <table className="supply-table">
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Owner</th>
                          <th>Due</th>
                          <th>Status</th>
                          <th className="text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {meetingActions.map((row) => (
                          <tr key={row._id}>
                            <td>{row.description}</td>
                            <td>{personName(row.ownerPersonId)}</td>
                            <td>{formatDate(row.dueDate)}</td>
                            <td>
                              <StatusChip
                                status={String(row.status)}
                                color={
                                  row.status === "open"
                                    ? CHIP_TONE_CLASS.warn
                                    : CHIP_TONE_CLASS.mute
                                }
                              />
                            </td>
                            <td className="text-right">
                              {row.status === "open" ? (
                                <button
                                  className="btn-link btn-link-compact"
                                  onClick={() => handleClose(row._id)}
                                >
                                  Close
                                </button>
                              ) : (
                                <span className="text-ink-2">
                                  {formatDate(row.closedAt)}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                <form
                  className="supply-form-grid mt-4"
                  onSubmit={(e) => addAction(e, meeting._id)}
                >
                  <label className="field-label">
                    Owner
                    <select
                      name="ownerPersonId"
                      className="input"
                      defaultValue={meeting.staffMemberId}
                      required
                    >
                      {activePeople.map((person) => (
                        <option key={person._id} value={person._id}>
                          {person.givenName} {person.familyName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Follow-up action
                    <input
                      name="description"
                      className="input"
                      placeholder="What needs to happen"
                      required
                    />
                  </label>
                  <label className="field-label">
                    Due (optional)
                    <BoundedDateInput name="dueDate" className="input" />
                  </label>
                  <div className="field-label">
                    <span>&nbsp;</span>
                    <button className="btn btn-secondary">Add action</button>
                  </div>
                </form>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
