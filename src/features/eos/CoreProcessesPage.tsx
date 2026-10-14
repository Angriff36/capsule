import { useState, type FormEvent } from "react";
import {
  useCoreProcessRemove,
  useCoreProcessRevise,
  useCoreProcessSetStage,
  useCreateCoreProcess,
  useListCoreProcess,
} from "@/lib/manifest-convex-react";
import { PageHeader, TableSkeleton } from "@/ui/primitives";
import type { Doc } from "../../lib/api";
import {
  EosPanel,
  EosTabs,
  InlineText,
  ProgressBar,
  useRun,
} from "./EosShared";
import {
  PROCESS_STAGES,
  SUGGESTED_PROCESSES,
  initials,
  lines,
  personName,
} from "./eosModel";
import { useActivePeople, useEosViewer } from "./useEosData";

type Process = Doc<"coreProcesses">;

const STAGE_INDEX = new Map(
  PROCESS_STAGES.map((entry, index) => [entry.stage, index]),
);

/**
 * EOS Process: name the handful of core processes, write down their major
 * steps, simplify them, and get them followed by all. Each process is a card
 * with a four-step stepper; click a step to move it there.
 */
export function CoreProcessesPage() {
  const processes = useListCoreProcess();
  const people = useActivePeople();
  const { canEdit } = useEosViewer();
  const start = useCreateCoreProcess();
  const { run, busy, banner } = useRun();
  const [draft, setDraft] = useState("");

  if (processes === undefined) {
    return (
      <div className="operations-stage supply-stage">
        <EosTabs />
        <TableSkeleton rows={6} />
      </div>
    );
  }

  const live = processes
    .filter((row) => row.namedAt != null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const followed = live.filter((row) => row.stage === "followed_by_all").length;
  const progress =
    live.length === 0
      ? 0
      : (live.reduce((sum, row) => sum + (STAGE_INDEX.get(row.stage) ?? 0), 0) /
          (live.length * 3)) *
        100;
  const missing = SUGGESTED_PROCESSES.filter(
    (name) =>
      !live.some((row) => row.name.toLowerCase() === name.toLowerCase()),
  );
  const nextOrder =
    live.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 1;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = draft.trim();
    if (!name) return;
    void run(() => start({ name, sortOrder: nextOrder })).then((ok) => {
      if (ok) setDraft("");
    });
  };

  return (
    <div className="operations-stage supply-stage">
      <EosTabs />
      <PageHeader
        eyebrow="EOS · Process"
        title="Core processes"
        lead="The Mangia way: a handful of processes, written down, made simple and followed by all."
        facts={[
          { label: "Processes", value: live.length },
          { label: "Followed by all", value: `${followed} of ${live.length}` },
        ]}
      />
      {banner}
      <div className="eos-stack">
        <EosPanel
          tone="process"
          eyebrow="Process"
          title="How far along"
          lead={
            live.length === 0
              ? "Most companies have 4 to 8 core processes."
              : `${Math.round(progress)}% of the way to every process followed by all`
          }
        >
          <ProgressBar value={progress} label="Core processes progress" />
          {canEdit ? (
            <form className="eos-add mt-3" onSubmit={submit}>
              <input
                className="input"
                aria-label="Name a core process"
                placeholder="Name a core process"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button
                className="btn btn-primary"
                disabled={busy || !draft.trim()}
              >
                Add process
              </button>
            </form>
          ) : null}
          {canEdit && missing.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink-3">Common in catering:</span>
              {missing.map((name, index) => (
                <button
                  key={name}
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      start({ name, sortOrder: nextOrder + index }),
                    )
                  }
                >
                  + {name}
                </button>
              ))}
            </div>
          ) : null}
        </EosPanel>
        {live.map((process) => (
          <ProcessCard
            key={process._id}
            process={process}
            people={people}
            canEdit={canEdit}
            busy={busy}
            run={run}
          />
        ))}
      </div>
    </div>
  );
}

function ProcessCard({
  process,
  people,
  canEdit,
  busy,
  run,
}: {
  process: Process;
  people: ReturnType<typeof useActivePeople>;
  canEdit: boolean;
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<boolean>;
}) {
  const revise = useCoreProcessRevise();
  const setStage = useCoreProcessSetStage();
  const remove = useCoreProcessRemove();
  const reached = STAGE_INDEX.get(process.stage) ?? 0;
  const owner = personName(people, process.ownerPersonId, "No owner");
  const steps = lines(process.steps);

  const save = (
    change: Partial<{ name: string; ownerPersonId: string; steps: string }>,
  ) =>
    run(() =>
      revise({
        docId: process._id,
        version: process.version,
        name: change.name ?? process.name,
        ownerPersonId:
          ("ownerPersonId" in change
            ? change.ownerPersonId
            : process.ownerPersonId) || undefined,
        steps: ("steps" in change ? change.steps : process.steps) || undefined,
        sortOrder: process.sortOrder,
      }),
    );

  return (
    <EosPanel
      tone="process"
      title={
        canEdit ? (
          <InlineText
            value={process.name}
            label="Process name"
            placeholder="Process name"
            onSave={(name) => (name ? save({ name }) : undefined)}
          />
        ) : (
          process.name
        )
      }
      actions={
        <span className="flex items-center gap-2 text-sm text-ink-2">
          <span className="eos-avatar" aria-hidden="true">
            {initials(owner)}
          </span>
          {canEdit ? (
            <select
              className="input"
              aria-label={`Owner of ${process.name}`}
              value={String(process.ownerPersonId ?? "")}
              disabled={busy}
              onChange={(event) =>
                void save({ ownerPersonId: event.target.value })
              }
            >
              <option value="">No owner</option>
              {people.map((person) => (
                <option key={person._id} value={person._id}>
                  {`${person.givenName} ${person.familyName}`.trim()}
                </option>
              ))}
            </select>
          ) : (
            owner
          )}
        </span>
      }
    >
      <div
        className="eos-stepper"
        role="group"
        aria-label={`${process.name} stage`}
      >
        {PROCESS_STAGES.map((entry, index) => (
          <button
            key={entry.stage}
            type="button"
            className={`eos-step${index <= reached ? " is-reached" : ""}`}
            title={entry.hint}
            aria-pressed={index === reached}
            disabled={!canEdit || busy || index === reached}
            onClick={() =>
              void run(() =>
                setStage({
                  docId: process._id,
                  version: process.version,
                  stage: entry.stage,
                }),
              )
            }
          >
            {index + 1}. {entry.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-ink-3">{PROCESS_STAGES[reached]?.hint}</p>
      <div className="mt-3">
        <span className="eos-field-label">
          Major steps{steps.length > 0 ? ` · ${steps.length}` : ""} · one per
          line
        </span>
        <InlineText
          multiline
          value={process.steps ?? ""}
          display={steps
            .map((step, index) => `${index + 1}. ${step}`)
            .join("\n")}
          label={`Steps of ${process.name}`}
          placeholder="Write the major steps, one per line (Ctrl+Enter saves)"
          disabled={!canEdit}
          onSave={(next) => save({ steps: next })}
        />
      </div>
      {canEdit ? (
        <div className="mt-2 text-right">
          <button
            type="button"
            className="btn-link btn-link-compact text-ink-3"
            disabled={busy}
            onClick={() =>
              void run(() =>
                remove({ docId: process._id, version: process.version }),
              )
            }
          >
            Remove process
          </button>
        </div>
      ) : null}
    </EosPanel>
  );
}
