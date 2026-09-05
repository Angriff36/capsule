import { useMemo, useState, type FormEvent } from "react";
import { useActionPrompt } from "../../ui/action-prompt";
import { useActionFailure, useActionNotice } from "../../ui/action-result";
import { ErrorState, Section, TableSkeleton } from "../../ui/primitives";

// ServiceStyle, Occasion and ReferralSource share one command shape
// (register / reviseDetails / deactivate / activate) and one field set, so a
// single section component serves all three; CatalogsPage wires each
// catalog's generated hooks into it.
export type CatalogRow = {
  _id: string;
  name: string;
  code: string;
  sortOrder: number;
  description?: string | null;
  status: string;
  version: number;
  deactivationReason?: string | null;
};

export type CatalogCommands = {
  register: (args: Record<string, unknown>) => Promise<unknown>;
  revise: (args: Record<string, unknown>) => Promise<unknown>;
  deactivate: (args: Record<string, unknown>) => Promise<unknown>;
  activate: (args: Record<string, unknown>) => Promise<unknown>;
};

type Props = {
  title: string;
  singular: string;
  /** Names the selector that reads this catalog, for the empty state. */
  feeds: string;
  rows: CatalogRow[] | undefined;
  commands: CatalogCommands;
};

export function CatalogsSection({
  title,
  singular,
  feeds,
  rows,
  commands,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const { error, setError } = useActionFailure();
  const { notice, setNotice } = useActionNotice();
  const { prompt, host } = useActionPrompt();

  const sorted = useMemo(
    () =>
      (rows ?? [])
        .slice()
        .sort(
          (a, b) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
            String(a.name).localeCompare(String(b.name)),
        ),
    [rows],
  );

  const run = async (key: string, work: () => Promise<unknown>) => {
    if (busy != null) return;
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `Could not save the ${singular}.`,
      );
    } finally {
      setBusy(null);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const code = String(data.get("code") ?? "").trim();
    if (!name || !code) {
      setError("Name and code are required.");
      return;
    }
    const sortRaw = String(data.get("sortOrder") ?? "").trim();
    const sortOrder =
      sortRaw !== "" && Number.isFinite(Number(sortRaw))
        ? Number(sortRaw)
        : undefined;
    const description =
      String(data.get("description") ?? "").trim() || undefined;
    void run("create", async () => {
      await commands.register({ name, code, sortOrder, description });
      form.reset();
      setNotice(`${name} added — selectors pick it up immediately.`);
    });
  };

  const rename = (row: CatalogRow) => {
    void (async () => {
      const values = await prompt.askFields({
        title: `Rename ${row.name}`,
        description:
          "The label people see. Existing records keep their link to this row.",
        fields: [
          {
            name: "name",
            label: "Name",
            defaultValue: row.name,
            required: true,
          },
          {
            name: "sortOrder",
            label: "Display order",
            defaultValue: String(row.sortOrder ?? 0),
            inputType: "number",
          },
          {
            name: "description",
            label: "Description",
            defaultValue: row.description ?? "",
          },
        ],
        confirmLabel: "Save",
      });
      if (!values) return;
      const name = values.name.trim();
      if (!name) return;
      const sortRaw = values.sortOrder.trim();
      const sortOrder =
        sortRaw !== "" && Number.isFinite(Number(sortRaw))
          ? Number(sortRaw)
          : undefined;
      const description = values.description.trim() || undefined;
      await run(`${row._id}:rename`, () =>
        commands.revise({
          docId: row._id,
          version: row.version,
          name,
          sortOrder,
          description,
        }),
      );
    })();
  };

  const retire = (row: CatalogRow) => {
    void (async () => {
      const reason = await prompt.askReason({
        title: `Retire ${row.name}`,
        description: `Retired ${singular}s stay on existing records but disappear from new selectors.`,
        label: "Reason",
        confirmLabel: "Retire",
      });
      if (!reason) return;
      await run(`${row._id}:retire`, () =>
        commands.deactivate({ docId: row._id, version: row.version, reason }),
      );
    })();
  };

  const reactivate = (row: CatalogRow) => {
    void run(`${row._id}:activate`, () =>
      commands.activate({ docId: row._id, version: row.version }),
    );
  };

  return (
    <Section title={title} count={sorted.length}>
      {host}
      {error ? (
        <ErrorState title={`Could not save the ${singular}`} detail={error} />
      ) : null}
      {notice ? (
        <p
          className="card border-ok/30 bg-ok-soft px-4 py-3 text-base text-ok"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <form
        className="supply-form grid gap-4 border-0 p-4 sm:grid-cols-2"
        onSubmit={submit}
      >
        <label className="field-label">
          Name
          <input
            name="name"
            className="input"
            placeholder="Full Service"
            required
            disabled={busy != null}
          />
        </label>
        <label className="field-label">
          Code
          <input
            name="code"
            className="input"
            placeholder="full_service"
            required
            disabled={busy != null}
          />
          <span className="field-hint">
            Stable identifier for imports and reporting.
          </span>
        </label>
        <label className="field-label">
          Display order
          <input
            name="sortOrder"
            type="number"
            min={0}
            step={1}
            className="input"
            disabled={busy != null}
          />
        </label>
        <label className="field-label">
          Description
          <input name="description" className="input" disabled={busy != null} />
        </label>
        <div className="supply-row-actions sm:col-span-2">
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy != null}
          >
            {busy === "create" ? "Adding…" : `Add ${singular}`}
          </button>
        </div>
      </form>

      {rows === undefined ? (
        <TableSkeleton rows={4} />
      ) : sorted.length === 0 ? (
        <div className="document-empty">
          <p>No {singular}s yet.</p>
          <span>Add the first one above — {feeds}.</span>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {sorted.map((row) => {
            const active = row.status === "active";
            return (
              <li
                key={row._id}
                className="flex flex-wrap items-start gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-ink">
                      {row.name}
                    </span>
                    <span className="font-mono text-2xs text-ink-2">
                      {row.code}
                    </span>
                    <span className="text-2xs text-ink-3">
                      #{row.sortOrder ?? 0}
                    </span>
                    {active ? (
                      <span className="chip border-ok/30 bg-ok-soft text-ok">
                        Active
                      </span>
                    ) : (
                      <span className="chip border-line-2 bg-inset text-ink-3">
                        Retired
                      </span>
                    )}
                  </p>
                  {row.description ? (
                    <p className="mt-1 text-sm text-ink-2">{row.description}</p>
                  ) : null}
                  {!active && row.deactivationReason ? (
                    <p className="mt-1 text-2xs text-ink-3">
                      Retired — {row.deactivationReason}
                    </p>
                  ) : null}
                </div>
                {active ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() => rename(row)}
                    >
                      {busy === `${row._id}:rename` ? "Saving…" : "Rename"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() => retire(row)}
                    >
                      {busy === `${row._id}:retire` ? "Retiring…" : "Retire"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy != null}
                    onClick={() => reactivate(row)}
                  >
                    {busy === `${row._id}:activate`
                      ? "Restoring…"
                      : "Reactivate"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
