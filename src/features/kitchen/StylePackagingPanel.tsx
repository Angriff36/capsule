import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateStylePackaging,
  useListServiceStyle,
  useStylePackagingRemove,
  useStylePackagingRevise,
} from "../../lib/manifest-convex-react";
import { useStylePackagingRows } from "../../lib/recipeScopedQueries";
import {
  packagingByStyle,
  type PackagingOwner,
  type ServiceStyleOption,
  type StylePackagingRow,
} from "./stylePackaging";

function PackagingFields({ row }: { row?: StylePackagingRow | null }) {
  return (
    <>
      <label className="field-label sm:col-span-2">
        How it is packaged or served
        <textarea
          name="instructions"
          className="input min-h-16 py-2"
          required
          defaultValue={row?.instructions ?? ""}
          placeholder="Once cooled, pack in a bain marie, cater wrap and label for the event"
        />
      </label>
      <label className="field-label">
        Goes out in
        <input
          name="container"
          className="input"
          defaultValue={row?.container ?? ""}
          placeholder="1/3 pan, bain marie"
        />
      </label>
    </>
  );
}

/**
 * How a recipe or a dish (or one dish version) is packaged for each service
 * style the company runs: drop off, bring hot, cook on site. The event's
 * service style picks which line its prep and pack lists show. Written lines
 * show; one form writes a line for any other service style.
 */
export function StylePackagingPanel({
  owner,
  onFailure,
}: {
  owner: PackagingOwner;
  onFailure: (error: unknown) => void;
}) {
  const styles = useListServiceStyle() as ServiceStyleOption[] | undefined;
  const rows = useStylePackagingRows(owner) as StylePackagingRow[] | undefined;
  const create = useCreateStylePackaging();
  const revise = useStylePackagingRevise();
  const remove = useStylePackagingRemove();
  const [busy, setBusy] = useState<string | null>(null);
  const lines = packagingByStyle(styles, rows, owner);
  const written = lines.filter((line) => line.row != null);
  const unwritten = lines.filter((line) => line.row == null);

  const run = (key: string, work: () => Promise<unknown>) =>
    (async () => {
      onFailure(null);
      setBusy(key);
      try {
        await work();
        return true;
      } catch (error) {
        onFailure(error);
        return false;
      } finally {
        setBusy(null);
      }
    })();

  const fields = (form: HTMLFormElement) => {
    const data = new FormData(form);
    return {
      styleId: String(data.get("serviceStyleId") ?? ""),
      instructions: String(data.get("instructions") ?? "").trim(),
      container: String(data.get("container") ?? "").trim() || undefined,
    };
  };

  const saveRow = (
    event: FormEvent<HTMLFormElement>,
    row: StylePackagingRow,
  ) => {
    event.preventDefault();
    const { instructions, container } = fields(event.currentTarget);
    if (!instructions) return;
    void run(row._id, () =>
      revise({ docId: row._id, version: row.version, instructions, container }),
    );
  };

  const addRow = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const { styleId, instructions, container } = fields(form);
    if (!styleId || !instructions) return;
    void run("add", () =>
      create({ ...owner, serviceStyleId: styleId, instructions, container }),
    ).then((ok) => {
      if (ok) form.reset();
    });
  };

  return (
    <section
      className="culinary-section"
      aria-label="Packaging by service style"
      data-testid="style-packaging"
    >
      <div className="culinary-section-heading">
        <h2>Packaging by service style</h2>
        <span>
          {styles === undefined || rows === undefined
            ? "Loading…"
            : `${written.length} of ${lines.length} written`}
        </span>
      </div>
      {styles !== undefined && lines.length === 0 ? (
        <p className="text-base text-ink-3">
          No service styles yet. Add them on the{" "}
          <Link to="/admin/catalogs">Catalogs</Link> page, then write how this
          goes out for each one.
        </p>
      ) : null}
      {rows !== undefined && lines.length > 0 && written.length === 0 ? (
        <p className="text-base text-ink-3">
          Not on file for any service style.
        </p>
      ) : null}
      {written.length > 0 ? (
        <ul className="m-0 list-none space-y-3 p-0">
          {written.map(({ style, row }) =>
            row ? (
              <li
                key={style._id}
                className="border-b border-line pb-3 last:border-b-0"
                data-testid={`packaging-${style._id}`}
              >
                <p className="text-sm font-semibold text-ink">{style.name}</p>
                <p className="whitespace-pre-line text-base text-ink">
                  {row.instructions}
                </p>
                {row.container ? (
                  <p className="text-sm text-ink-2">
                    Goes out in: {row.container}
                  </p>
                ) : null}
                <details className="recipe-add-editor">
                  <summary>Edit</summary>
                  <form
                    key={`${row._id}:${row.version}`}
                    className="culinary-create-grid"
                    onSubmit={(event) => saveRow(event, row)}
                  >
                    <PackagingFields row={row} />
                    <div className="flex flex-wrap items-end gap-2">
                      <button
                        className="btn btn-primary"
                        disabled={busy != null}
                      >
                        {busy === row._id ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy != null}
                        onClick={() =>
                          void run(row._id, () =>
                            remove({ docId: row._id, version: row.version }),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </form>
                </details>
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
      {unwritten.length > 0 ? (
        <details className="recipe-add-editor" data-testid="packaging-add">
          <summary>Write packaging for a service style</summary>
          <form className="culinary-create-grid" onSubmit={addRow}>
            <label className="field-label sm:col-span-2">
              Service style
              <select name="serviceStyleId" className="input" required>
                {unwritten.map(({ style }) => (
                  <option key={style._id} value={style._id}>
                    {style.name}
                  </option>
                ))}
              </select>
            </label>
            <PackagingFields />
            <button
              className="btn btn-primary self-end"
              disabled={busy != null}
            >
              {busy === "add" ? "Saving…" : "Save"}
            </button>
          </form>
        </details>
      ) : null}
    </section>
  );
}
