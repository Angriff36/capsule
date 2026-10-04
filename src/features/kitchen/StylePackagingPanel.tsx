import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateStylePackaging,
  useListServiceStyle,
  useListStylePackaging,
  useStylePackagingRemove,
  useStylePackagingRevise,
} from "../../lib/manifest-convex-react";
import {
  packagingByStyle,
  type PackagingOwner,
  type ServiceStyleOption,
  type StylePackagingRow,
} from "./stylePackaging";

/**
 * How a recipe or a dish (or one dish version) is packaged for each service
 * style the company runs: drop off, bring hot, cook on site. The event's
 * service style picks which line its prep and pack lists show.
 */
export function StylePackagingPanel({
  owner,
  onFailure,
}: {
  owner: PackagingOwner;
  onFailure: (error: unknown) => void;
}) {
  const styles = useListServiceStyle() as ServiceStyleOption[] | undefined;
  const rows = useListStylePackaging() as StylePackagingRow[] | undefined;
  const create = useCreateStylePackaging();
  const revise = useStylePackagingRevise();
  const remove = useStylePackagingRemove();
  const [busy, setBusy] = useState<string | null>(null);
  const lines = packagingByStyle(styles, rows, owner);
  const filled = lines.filter((line) => line.row != null).length;

  const run = (key: string, work: () => Promise<unknown>) => {
    void (async () => {
      onFailure(null);
      setBusy(key);
      try {
        await work();
      } catch (error) {
        onFailure(error);
      } finally {
        setBusy(null);
      }
    })();
  };

  const save = (
    event: FormEvent<HTMLFormElement>,
    style: ServiceStyleOption,
    row: StylePackagingRow | null,
  ) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const instructions = String(data.get("instructions") ?? "").trim();
    const container = String(data.get("container") ?? "").trim();
    if (!instructions) return;
    run(style._id, () =>
      row
        ? revise({
            docId: row._id,
            version: row.version,
            instructions,
            container: container || undefined,
          })
        : create({
            ...owner,
            serviceStyleId: style._id,
            instructions,
            container: container || undefined,
          }),
    );
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
            : `${filled} of ${lines.length} written`}
        </span>
      </div>
      {styles !== undefined && lines.length === 0 ? (
        <p className="text-base text-ink-3">
          No service styles yet. Add them on the{" "}
          <Link to="/admin/catalogs">Catalogs</Link> page, then write how this
          goes out for each one.
        </p>
      ) : null}
      <ul className="m-0 list-none space-y-3 p-0">
        {lines.map(({ style, row }) => (
          <li
            key={style._id}
            className="border-b border-line pb-3 last:border-b-0"
            data-testid={`packaging-${style._id}`}
          >
            <p className="text-sm font-semibold text-ink">{style.name}</p>
            {row ? (
              <>
                <p className="whitespace-pre-line text-base text-ink">
                  {row.instructions}
                </p>
                {row.container ? (
                  <p className="text-sm text-ink-2">
                    Goes out in: {row.container}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-base text-ink-3">Not on file</p>
            )}
            <details className="recipe-add-editor">
              <summary>{row ? "Edit" : "Write packaging"}</summary>
              <form
                key={`${style._id}:${row?._id ?? "new"}:${row?.version ?? 0}`}
                className="culinary-create-grid"
                onSubmit={(event) => save(event, style, row)}
              >
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
                <div className="flex flex-wrap items-end gap-2">
                  <button className="btn btn-primary" disabled={busy != null}>
                    {busy === style._id ? "Saving…" : "Save"}
                  </button>
                  {row ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy != null}
                      onClick={() =>
                        run(style._id, () =>
                          remove({ docId: row._id, version: row.version }),
                        )
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </form>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
