import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Id } from "../../lib/api";
import {
  checklistLinesToAdd,
  CHECKLIST_PRIORITIES,
  dueState,
  parseChecklistLines,
} from "../../lib/eventChecklists";
import { useEventTaskRows } from "../../lib/eventScopedQueries";
import { formatCountNoun, toDatetimeLocalValue } from "../../lib/format";
import {
  useCreateEventTask,
  useEventTaskComplete,
  useEventTaskGiveTo,
  useEventTaskRemove,
  useEventTaskReopen,
  useEventTaskRevise,
  useEventTaskSkip,
  useEventTaskStart,
  useListEventChecklist,
  useListPerson,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { useActionPrompt } from "../../ui/action-prompt";
import { EmptyState } from "../../ui/primitives";
import { useSuccessToast } from "../../ui/useSuccessToast";
import { resolveManifestPolicies } from "../admin/rolePermissionAudit";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { eventDetailPath } from "./eventRoutes";
import { EventTabIntro } from "./EventTabIntro";
import { FailureBanner } from "./FailureBanner";

type TaskRow = {
  _id: string;
  version: number;
  title: string;
  details?: string | null;
  category?: string | null;
  ownerPersonId?: string | null;
  dueAt?: number | null;
  priority: string;
  status: string;
  waitsForTaskId?: string | null;
  proofRequired?: boolean | null;
  doneNote?: string | null;
  doneAt?: number | null;
  doneByPersonId?: string | null;
  skipReason?: string | null;
  checklistTemplateId?: string | null;
  templateLineKey?: string | null;
  deletedAt?: number | null;
};

const dueFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Event to-dos: work around the event that is not a block on the day-of
 * timeline (book the permit, check the van, count the linen back in). The
 * whole crew can tick a to-do; the people who plan events add, change and
 * remove them, one at a time or from a checklist.
 */
export function EventTodosTab({
  eventId,
  startsAt,
}: {
  eventId: Id<"events">;
  startsAt?: number | null;
}) {
  const formId = useId();
  const authStatus = useAuthStatus();
  const tasks = useEventTaskRows(eventId) as TaskRow[] | undefined;
  const people = useListPerson();
  const checklists = useListEventChecklist();
  const addTask = useCreateEventTask();
  const complete = useEventTaskComplete();
  const giveTo = useEventTaskGiveTo();
  const remove = useEventTaskRemove();
  const reopen = useEventTaskReopen();
  const revise = useEventTaskRevise();
  const skip = useEventTaskSkip();
  const start = useEventTaskStart();
  const [showAdd, setShowAdd] = useState(false);
  const [checklistId, setChecklistId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);
  const { notifySuccess, host: savedToast } = useSuccessToast();

  const permissions = new Set(resolveManifestPolicies(authStatus?.role ?? ""));
  const canPlan = [
    "eventAccess",
    "salesAccess",
    "logisticsAccess",
    "manageAccess",
  ].some((capability) => permissions.has(capability));

  const now = Date.now();
  const live = (tasks ?? []).filter((task) => task.deletedAt == null);
  const open = live
    .filter((task) => task.status === "open" || task.status === "in_progress")
    .sort(
      (a, b) =>
        Number(a.dueAt ?? Infinity) - Number(b.dueAt ?? Infinity) ||
        (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2),
    );
  const closed = live
    .filter((task) => task.status === "done" || task.status === "skipped")
    .sort((a, b) => Number(b.doneAt ?? 0) - Number(a.doneAt ?? 0));
  const late = open.filter(
    (task) => dueState(task.dueAt, false, now) === "late",
  ).length;
  const roster = (people ?? [])
    .filter((person) => person.deletedAt == null && person.status === "active")
    .map((person) => ({
      id: person._id,
      name:
        `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim() ||
        "Unnamed",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (id: string | null | undefined) =>
    id ? ((people ?? []).find((person) => person._id === id) ?? null) : null;
  const personLabel = (id: string | null | undefined) => {
    const person = nameOf(id);
    return person
      ? `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim()
      : "";
  };
  const activeChecklists = (checklists ?? []).filter(
    (row) => row.deletedAt == null && String(row.status) === "active",
  );
  const picked = activeChecklists.find((row) => row._id === checklistId);
  const toAdd = picked
    ? checklistLinesToAdd(
        picked._id,
        parseChecklistLines(picked.itemsJson),
        startsAt,
        live,
      )
    : [];

  const run = async (
    key: string,
    work: () => Promise<unknown>,
    ok: string,
  ): Promise<boolean> => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
      notifySuccess(ok);
      return true;
    } catch (error) {
      setFailure(classifyCommandFailure(error));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const submitAdd = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const data = new FormData(form);
    const due = String(data.get("dueAt") ?? "");
    void run(
      "add",
      () =>
        addTask({
          eventId,
          title: String(data.get("title") ?? "").trim(),
          details: String(data.get("details") ?? "").trim() || undefined,
          category: String(data.get("category") ?? "").trim() || undefined,
          ownerPersonId: String(data.get("ownerPersonId") ?? "") || undefined,
          dueAt: due ? new Date(due).getTime() : undefined,
          priority: String(data.get("priority") ?? "medium"),
          waitsForTaskId: String(data.get("waitsForTaskId") ?? "") || undefined,
          proofRequired: data.get("proofRequired") === "on",
        }),
      "To-do added",
    ).then((saved) => {
      if (saved) {
        form.reset();
        setShowAdd(false);
      }
    });
  };

  const applyChecklist = () => {
    if (!picked || toAdd.length === 0) return;
    void run(
      "checklist",
      async () => {
        for (const line of toAdd)
          await addTask({
            eventId,
            title: line.title,
            details: line.details || undefined,
            category: picked.category ?? undefined,
            dueAt: line.dueAt,
            priority: line.priority,
            proofRequired: line.proofRequired,
            checklistTemplateId: picked._id,
            templateLineKey: line.key,
          });
      },
      `${formatCountNoun(toAdd.length, "to-do")} added from ${picked.name}`,
    ).then((saved) => {
      if (saved) setChecklistId("");
    });
  };

  const finish = async (task: TaskRow) => {
    let note: string | undefined;
    if (task.proofRequired) {
      const values = await prompt.askFields({
        title: "This to-do needs proof",
        description:
          "Add the photo or file on the event's Photos page, then say here what it is.",
        confirmLabel: "Mark done",
        fields: [
          {
            name: "note",
            label: "What is the proof?",
            inputType: "text",
            required: false,
            placeholder: "For example: permit photo added",
          },
        ],
      });
      if (!values) return;
      note = values.note?.trim() || undefined;
    }
    void run(
      `${task._id}:done`,
      () => complete({ docId: task._id, version: task.version, note }),
      "To-do done",
    );
  };

  const change = async (task: TaskRow) => {
    const values = await prompt.askFields({
      title: "Change this to-do",
      description: "Every box is saved as shown; empty a box to clear it.",
      confirmLabel: "Save",
      fields: [
        {
          name: "title",
          label: "To-do",
          inputType: "text",
          required: true,
          defaultValue: task.title,
        },
        {
          name: "dueAt",
          label: "Due",
          inputType: "datetime-local",
          required: false,
          defaultValue:
            task.dueAt != null ? toDatetimeLocalValue(task.dueAt) : "",
        },
        {
          name: "priority",
          label: "How important",
          required: true,
          defaultValue: task.priority,
          options: CHECKLIST_PRIORITIES.map((entry) => ({
            value: entry.value,
            label: entry.label,
          })),
        },
        {
          name: "category",
          label: "Kind of work",
          inputType: "text",
          required: false,
          defaultValue: task.category ?? "",
        },
        {
          name: "waitsForTaskId",
          label: "Wait for",
          required: false,
          defaultValue: task.waitsForTaskId ?? "",
          options: [
            { value: "", label: "Nothing" },
            ...live
              .filter((row) => row._id !== task._id)
              .map((row) => ({ value: row._id, label: row.title })),
          ],
        },
        {
          name: "proofRequired",
          label: "Needs proof",
          required: true,
          defaultValue: task.proofRequired ? "yes" : "no",
          options: [
            { value: "no", label: "No" },
            { value: "yes", label: "Yes, a photo or file" },
          ],
        },
        {
          name: "details",
          label: "Details",
          multiline: true,
          required: false,
          defaultValue: task.details ?? "",
        },
      ],
    });
    if (!values) return;
    void run(
      `${task._id}:change`,
      () =>
        revise({
          docId: task._id,
          version: task.version,
          title: values.title?.trim() ?? task.title,
          details: values.details?.trim() || undefined,
          category: values.category?.trim() || undefined,
          dueAt: values.dueAt ? new Date(values.dueAt).getTime() : undefined,
          priority: values.priority || task.priority,
          waitsForTaskId: values.waitsForTaskId || undefined,
          proofRequired: values.proofRequired === "yes",
        }),
      "To-do saved",
    );
  };

  const skipTask = async (task: TaskRow) => {
    const reason = await prompt.askReason({
      title: "Skip this to-do",
      description: "Say why it is not needed for this event.",
      label: "Why is it not needed?",
      confirmLabel: "Skip",
    });
    if (!reason) return;
    void run(
      `${task._id}:skip`,
      () => skip({ docId: task._id, version: task.version, reason }),
      "To-do skipped",
    );
  };

  const meta = (task: TaskRow): string[] => {
    const waitsFor = live.find((row) => row._id === task.waitsForTaskId);
    return [
      personLabel(task.ownerPersonId) || "Nobody yet",
      task.category ?? "",
      task.status === "in_progress" ? "Started" : "",
      waitsFor && waitsFor.status !== "done" && waitsFor.status !== "skipped"
        ? `Waits for: ${waitsFor.title}`
        : "",
      task.proofRequired ? "Needs proof" : "",
    ].filter(Boolean);
  };

  return (
    <section className="space-y-4" data-testid="event-todos-tab">
      <EventTabIntro
        title="To-dos"
        description="Work around this event that is not on the day-of timeline. Tick a to-do when it is done."
      />
      {savedToast}
      {host}
      {failure ? <FailureBanner failure={failure} /> : null}

      <div className="fact-row">
        <span className="fact">
          <b>Open:</b>
          {open.length}
        </span>
        <span className="fact">
          <b>Late:</b>
          {late}
        </span>
        <span className="fact">
          <b>Done:</b>
          {closed.length}
        </span>
      </div>

      {canPlan ? (
        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button"
            className="btn btn-primary"
            aria-expanded={showAdd}
            aria-controls={formId}
            onClick={() => setShowAdd((value) => !value)}
          >
            {showAdd ? "Close form" : "Add a to-do"}
          </button>
          <label className="field-label">
            <span>Add from a checklist</span>
            <select
              className="input min-h-10"
              value={checklistId}
              onChange={(event) => setChecklistId(event.target.value)}
            >
              <option value="">Select a checklist</option>
              {activeChecklists.map((row) => (
                <option key={row._id} value={row._id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          {picked ? (
            <button
              type="button"
              className="btn btn-ghost min-h-10"
              disabled={busy != null || toAdd.length === 0}
              onClick={applyChecklist}
            >
              {busy === "checklist"
                ? "Adding…"
                : toAdd.length === 0
                  ? "Already on this event"
                  : `Add ${formatCountNoun(toAdd.length, "to-do")}`}
            </button>
          ) : null}
          <Link className="text-link" to="/events/checklists">
            Checklists
          </Link>
        </div>
      ) : null}
      {picked && toAdd.length > 0 && startsAt == null ? (
        <p className="text-base text-ink-2">
          This event has no date yet, so the to-dos are added with no due time.
        </p>
      ) : null}

      {showAdd && canPlan ? (
        <form
          id={formId}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={submitAdd}
        >
          <label className="field-label sm:col-span-2">
            <span>To-do</span>
            <input
              name="title"
              className="input min-h-10 w-full"
              required
              placeholder="For example: Book the venue permit"
            />
          </label>
          <label className="field-label">
            <span>Due</span>
            <input
              name="dueAt"
              type="datetime-local"
              className="input min-h-10 w-full"
            />
          </label>
          <label className="field-label">
            <span>Who</span>
            <select name="ownerPersonId" className="input min-h-10 w-full">
              <option value="">Nobody yet</option>
              {roster.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            <span>How important</span>
            <select
              name="priority"
              className="input min-h-10 w-full"
              defaultValue="medium"
            >
              {CHECKLIST_PRIORITIES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            <span>Kind of work</span>
            <input
              name="category"
              className="input min-h-10 w-full"
              placeholder="For example: Paperwork"
            />
          </label>
          <label className="field-label">
            <span>Wait for</span>
            <select name="waitsForTaskId" className="input min-h-10 w-full">
              <option value="">Nothing</option>
              {open.map((task) => (
                <option key={task._id} value={task._id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-10 items-center gap-2 text-base">
            <input type="checkbox" name="proofRequired" className="size-5" />
            Needs proof (a photo or file)
          </label>
          <label className="field-label sm:col-span-2 lg:col-span-3">
            <span>Details</span>
            <input name="details" className="input min-h-10 w-full" />
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy != null}
            >
              {busy === "add" ? "Adding…" : "Add to-do"}
            </button>
          </div>
        </form>
      ) : null}

      {tasks === undefined ? null : live.length === 0 ? (
        <EmptyState
          title="No to-dos on this event."
          hint={
            canPlan
              ? "Add one, or add a whole checklist."
              : "The people who plan this event add to-dos here."
          }
        />
      ) : (
        <ul className="border-t-[1.5px] border-ink">
          {open.map((task) => {
            const state = dueState(task.dueAt, false, now);
            const id = `${formId}-${task._id}`;
            return (
              <li key={task._id} className="border-b border-line">
                <div className="flex min-h-[60px] items-center gap-3.5 py-2.5">
                  <span className="-m-2 flex size-11 shrink-0 items-center justify-center">
                    <input
                      id={id}
                      type="checkbox"
                      className="size-7 shrink-0 cursor-pointer accent-ok"
                      checked={busy === `${task._id}:done`}
                      disabled={busy != null}
                      aria-label={`Done: ${task.title}`}
                      onChange={(event) => {
                        if (event.target.checked) void finish(task);
                      }}
                    />
                  </span>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold break-words text-ink">
                        {task.title}
                        {task.priority === "critical" ? (
                          <span className="ml-2 text-sm font-bold tracking-[0.04em] text-danger uppercase">
                            Must do
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-sm break-words text-ink-3">
                        {meta(task).join(" · ")}
                      </span>
                      {task.details ? (
                        <span className="block text-sm break-words text-ink-2">
                          {task.details}
                        </span>
                      ) : null}
                    </span>
                    {task.dueAt != null ? (
                      <time
                        dateTime={new Date(task.dueAt).toISOString()}
                        className={`shrink-0 text-right font-mono text-sm whitespace-nowrap ${state === "late" ? "font-semibold text-danger" : state === "soon" ? "font-semibold text-warn" : "text-ink-2"}`}
                      >
                        {dueFmt.format(task.dueAt)}
                        {state === "late" ? " · late" : ""}
                        {state === "soon" ? " · soon" : ""}
                      </time>
                    ) : (
                      <span className="shrink-0 font-mono text-sm whitespace-nowrap text-ink-3">
                        No time
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2 pb-3 pl-[50px]">
                  {task.status === "open" ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() =>
                        void run(
                          `${task._id}:start`,
                          () =>
                            start({ docId: task._id, version: task.version }),
                          "To-do started",
                        )
                      }
                    >
                      Start
                    </button>
                  ) : null}
                  <select
                    className="input"
                    aria-label={`Who does: ${task.title}`}
                    value={task.ownerPersonId ?? ""}
                    disabled={busy != null}
                    onChange={(event) =>
                      void run(
                        `${task._id}:give`,
                        () =>
                          giveTo({
                            docId: task._id,
                            version: task.version,
                            ownerPersonId: event.target.value || undefined,
                          }),
                        "To-do handed over",
                      )
                    }
                  >
                    <option value="">Nobody yet</option>
                    {task.ownerPersonId &&
                    !roster.some(
                      (person) => person.id === task.ownerPersonId,
                    ) ? (
                      <option value={task.ownerPersonId} disabled>
                        {personLabel(task.ownerPersonId) || "Former staff"}
                      </option>
                    ) : null}
                    {roster.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy != null}
                    onClick={() => void skipTask(task)}
                  >
                    Skip
                  </button>
                  {canPlan ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() => void change(task)}
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() =>
                          void run(
                            `${task._id}:remove`,
                            () =>
                              remove({
                                docId: task._id,
                                version: task.version,
                              }),
                            "To-do removed",
                          )
                        }
                      >
                        Remove
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
          {closed.map((task) => (
            <li key={task._id} className="border-b border-line">
              <div className="flex min-h-[60px] items-center gap-3.5 py-2.5">
                <span className="-m-2 flex size-11 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    className="size-7 shrink-0 accent-ok"
                    checked={task.status === "done"}
                    readOnly
                    aria-label={`${task.status === "done" ? "Done" : "Skipped"}: ${task.title}`}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold break-words text-ink-3 line-through">
                    {task.title}
                  </span>
                  <span className="block text-sm break-words text-ink-3">
                    {task.status === "done"
                      ? [
                          `Done${personLabel(task.doneByPersonId) ? ` by ${personLabel(task.doneByPersonId)}` : ""}`,
                          task.doneAt != null ? dueFmt.format(task.doneAt) : "",
                          task.doneNote ?? "",
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : `Skipped: ${task.skipReason ?? ""}`}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                  onClick={() =>
                    void run(
                      `${task._id}:reopen`,
                      () => reopen({ docId: task._id, version: task.version }),
                      "To-do reopened",
                    )
                  }
                >
                  Reopen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open.some((task) => task.proofRequired) ? (
        <p className="text-sm text-ink-2">
          Proof for a to-do goes on the event's{" "}
          <Link className="text-link" to={eventDetailPath(eventId, "photos")}>
            Photos
          </Link>{" "}
          page.
        </p>
      ) : null}
    </section>
  );
}
