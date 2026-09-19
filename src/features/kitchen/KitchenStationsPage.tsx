import { useState, type FormEvent } from "react";
import {
  useCreateStation,
  useListStation,
  useStationReinstate,
  useStationRename,
  useStationRetire,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { PageHeader, StatusChip, TableSkeleton } from "../../ui/primitives";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { KitchenBookNav } from "./KitchenBookNav";

function aliasList(raw: string): string[] {
  return raw
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);
}

function wholeNumber(raw: string | undefined): number | undefined {
  const value = Number(raw);
  return raw != null &&
    raw.trim() !== "" &&
    Number.isFinite(value) &&
    value >= 0
    ? Math.round(value)
    : undefined;
}

/**
 * The controlled station names the printed sheets group work by. Renaming a
 * station never touches task rows, and aliases keep old spellings matching on
 * import.
 */
export function KitchenStationsPage() {
  const stations = useListStation();
  const defineStation = useCreateStation();
  const renameStation = useStationRename();
  const retireStation = useStationRetire();
  const reinstateStation = useStationReinstate();
  const { prompt, host } = useActionPrompt();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const rows = (stations ?? [])
    .filter((station) => station.deletedAt == null && station.definedAt != null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const run = async (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const onAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    const aliases = aliasList(String(data.get("aliases") ?? ""));
    void run("add", async () => {
      await defineStation({
        name,
        sortOrder:
          wholeNumber(String(data.get("sortOrder") ?? "")) ?? rows.length,
        aliases: aliases.length ? aliases : undefined,
      });
      form.reset();
    });
  };

  const onRename = (station: (typeof rows)[number]) => {
    void (async () => {
      // rename() keeps an omitted order or alias list, but the form still
      // carries every saved value so the cook edits what is on file.
      const values = await prompt.askFields({
        title: "Edit station",
        description: `Rename ${station.name}, change where it sorts, or change the spellings imports match.`,
        fields: [
          {
            name: "name",
            label: "Station name",
            defaultValue: station.name,
            required: true,
          },
          {
            name: "sortOrder",
            label: "Sheet order",
            inputType: "number",
            defaultValue: String(station.sortOrder),
            required: true,
          },
          {
            name: "aliases",
            label: "Other spellings, separated by commas",
            defaultValue: (station.aliases ?? []).join(", "),
            required: false,
          },
        ],
        confirmLabel: "Save station",
      });
      if (!values) return;
      const name = (values.name ?? "").trim();
      if (!name) return;
      await run(`rename:${station._id}`, () =>
        renameStation({
          docId: station._id,
          version: station.version,
          name,
          sortOrder: wholeNumber(values.sortOrder) ?? station.sortOrder,
          aliases: aliasList(values.aliases ?? ""),
        }),
      );
    })();
  };

  const onRetire = (station: (typeof rows)[number]) => {
    void (async () => {
      const reason = (
        await prompt.askReason({
          title: "Retire station",
          description: `Stop offering ${station.name} on new work.`,
          label: "Reason",
          confirmLabel: "Retire station",
          tone: "danger",
        })
      )?.trim();
      if (!reason) return;
      await run(`retire:${station._id}`, () =>
        retireStation({
          docId: station._id,
          version: station.version,
          reason,
        }),
      );
    })();
  };

  return (
    <div className="component-book-stage culinary-studio">
      <PageHeader
        title="Kitchen stations"
        lead="The station names the printed prep sheets group work by. Renaming one never moves the work that already names it."
      />
      <KitchenBookNav />
      {host}
      {failure ? (
        <div className="mt-4">
          <CulinaryFailureBanner error={failure} />
        </div>
      ) : null}

      {stations === undefined ? (
        <TableSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <div className="document-empty">
          <p>No stations yet.</p>
          <span>Add the sections your prep sheets are grouped by.</span>
        </div>
      ) : (
        <div className="supply-table-wrap mt-4">
          <table className="supply-table">
            <thead>
              <tr>
                <th>Station</th>
                <th>Other spellings</th>
                <th>Sheet order</th>
                <th>State</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((station) => (
                <tr key={station._id}>
                  <td>
                    <strong>{station.name}</strong>
                  </td>
                  <td>{(station.aliases ?? []).join(", ") || "—"}</td>
                  <td>{station.sortOrder}</td>
                  <td>
                    <StatusChip status={String(station.status)} />
                  </td>
                  <td>
                    <div className="supply-row-actions">
                      {String(station.status) === "active" ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy != null}
                            onClick={() => onRename(station)}
                          >
                            {busy === `rename:${station._id}`
                              ? "Saving…"
                              : "Edit"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy != null}
                            onClick={() => onRetire(station)}
                          >
                            {busy === `retire:${station._id}`
                              ? "Working…"
                              : "Retire"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() =>
                            void run(`reinstate:${station._id}`, () =>
                              reinstateStation({
                                docId: station._id,
                                version: station.version,
                              }),
                            )
                          }
                        >
                          {busy === `reinstate:${station._id}`
                            ? "Working…"
                            : "Reinstate"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        className="mt-4 rounded-sm border border-line-2 bg-panel p-4"
        onSubmit={onAdd}
      >
        <p className="eyebrow">Add a station</p>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <label className="field-label">
            Station name
            <input
              name="name"
              className="input"
              placeholder="Finish at Event"
              required
            />
          </label>
          <label className="field-label">
            Sheet order
            <input
              name="sortOrder"
              type="number"
              min={0}
              step={1}
              className="input"
              placeholder={String(rows.length)}
            />
          </label>
          <label className="field-label">
            Other spellings, separated by commas
            <input
              name="aliases"
              className="input"
              placeholder="Finish At Event, FAE"
            />
          </label>
        </div>
        <button
          type="submit"
          className="btn btn-primary btn-sm mt-3"
          disabled={busy != null}
        >
          {busy === "add" ? "Adding…" : "Add station"}
        </button>
      </form>
    </div>
  );
}
