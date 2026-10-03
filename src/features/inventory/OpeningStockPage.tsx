// Opening stock (PL-OPENING-STOCK): the rows of an imported count sheet,
// kept apart by what they are, each with its open issues in plain words. A
// person fixes a row, sets it aside, or uses a ready food row as the opening
// stock for that item and place. Using a row is the cutover choice.
import { Fragment, useMemo, useState } from "react";
import {
  useListComponent,
  useListIngredient,
  useListOpeningStockRecord,
  useListStorageLocation,
} from "../../lib/manifest-convex-react";
import {
  OPENING_STOCK_ISSUE_TEXT,
  OPENING_STOCK_KIND_TEXT,
  parseIssues,
  type OpeningStockCountState,
  type OpeningStockKind,
} from "../../lib/openingStock";
import { formatCountNoun } from "../../lib/format";
import { useActionPrompt } from "../../ui/action-prompt";
import { PageHeader, TableSkeleton } from "../../ui/primitives";
import {
  useApplyOpeningStock,
  useReviewOpeningStock,
  useSetAsideOpeningStock,
} from "../facilities/openingStock";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import { SupplyFailureBanner } from "./SupplyFailureBanner";
import { OpeningStockImport } from "./OpeningStockImport";
import {
  COUNT_STATE_TEXT,
  OpeningStockFixForm,
  type OpeningStockFixValues,
} from "./OpeningStockFixForm";

type Tab = "needs_review" | "ready" | "done";
const TABS: Array<[Tab, string]> = [
  ["needs_review", "Needs a fix"],
  ["ready", "Ready to use"],
  ["done", "Used or set aside"],
];
const KIND_ORDER: OpeningStockKind[] = [
  "ingredient",
  "component",
  "equipment",
  "disposable",
  "instruction",
  "unsorted",
];

const amount = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
const day = (at: number | null | undefined) =>
  at == null
    ? "No date"
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(at);

export function OpeningStockPage() {
  const records = useListOpeningStockRecord();
  const ingredients = useListIngredient();
  const components = useListComponent();
  const locations = useListStorageLocation();
  const review = useReviewOpeningStock();
  const setAside = useSetAsideOpeningStock();
  const apply = useApplyOpeningStock();
  const [tab, setTab] = useState<Tab>("needs_review");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of [...(ingredients ?? []), ...(components ?? [])])
      map.set(String(row._id), String(row.name));
    return map;
  }, [ingredients, components]);
  const unitOf = useMemo(
    () =>
      new Map(
        (ingredients ?? []).map((row) => [String(row._id), String(row.unit)]),
      ),
    [ingredients],
  );

  const all = records ?? [];
  const counts = {
    needs_review: all.filter((row) => row.status === "needs_review").length,
    ready: all.filter((row) => row.status === "ready").length,
    done: all.filter(
      (row) => row.status === "applied" || row.status === "set_aside",
    ).length,
  };
  const shown = all
    .filter((row) =>
      tab === "done"
        ? row.status === "applied" || row.status === "set_aside"
        : row.status === tab,
    )
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind as OpeningStockKind) -
          KIND_ORDER.indexOf(b.kind as OpeningStockKind) ||
        String(a.itemName).localeCompare(String(b.itemName)),
    );

  const run = async (key: string, work: () => Promise<string | void>) => {
    setFailure(null);
    setNotice(null);
    setBusy(key);
    try {
      const message = await work();
      if (message) setNotice(message);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const save = (id: string, values: OpeningStockFixValues) =>
    run(`${id}:save`, async () => {
      await review({ ...values, recordId: id } as Parameters<typeof review>[0]);
      setEditing(null);
      return "Row saved.";
    });

  const applyRow = (row: (typeof all)[number]) =>
    run(`${row._id}:apply`, async () => {
      const result = await apply({ recordId: row._id as never });
      return `${row.itemName}: opening stock set to ${amount(result.quantityOnHand)} ${unitOf.get(String(row.ingredientId)) ?? ""}.`;
    });

  const setRowAside = (row: (typeof all)[number]) => {
    void (async () => {
      const reason = (
        await prompt.askReason({
          title: "Set this row aside",
          description: `${row.itemName} will not be used as opening stock.`,
          label: "Why",
          confirmLabel: "Set aside",
          cancelLabel: "Keep it",
        })
      )?.trim();
      if (!reason) return;
      void run(`${row._id}:aside`, async () => {
        await setAside({ recordId: row._id as never, reason });
        return "Row set aside.";
      });
    })();
  };

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Opening stock"
        lead="Bring in a stock count sheet, fix what the sheet left unclear, then pick which counts become the stock on hand. A gap in the sheet never becomes zero or a guessed amount."
      />
      <InventoryWorkspaceNav />
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="px-4 text-xs text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}
      <OpeningStockImport />

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Inventory · Opening stock</p>
            <h2>Count sheet rows</h2>
          </div>
          <div className="flex flex-wrap gap-2" role="tablist">
            {TABS.map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                className={`btn btn-sm ${tab === value ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setTab(value)}
              >
                {label} ({counts[value]})
              </button>
            ))}
          </div>
        </div>
        {records === undefined ? (
          <TableSkeleton rows={5} />
        ) : shown.length === 0 ? (
          <div className="document-empty">
            <p>
              {all.length === 0
                ? "No count sheet has been brought in."
                : "Nothing here."}
            </p>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>What it is</th>
                  <th>Amount on the sheet</th>
                  <th>In catalog unit</th>
                  <th>Kept in</th>
                  <th>Counted</th>
                  <th>What needs doing</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const issues = parseIssues(row.issues);
                  const id = String(row._id);
                  const linked =
                    names.get(
                      String(row.ingredientId ?? row.componentId ?? ""),
                    ) ?? null;
                  return (
                    <Fragment key={id}>
                      <tr>
                        <td>
                          <strong>{row.itemName}</strong>
                          {linked && linked !== row.itemName ? (
                            <small> · {linked}</small>
                          ) : null}
                          <small className="block text-ink-3">
                            {row.sourceFile}
                          </small>
                        </td>
                        <td>
                          {
                            OPENING_STOCK_KIND_TEXT[
                              row.kind as OpeningStockKind
                            ]
                          }
                        </td>
                        <td>
                          {row.quantity == null
                            ? "No amount"
                            : `${amount(row.quantity)} ${row.sourceUnit || "(no unit)"}`}
                        </td>
                        <td>
                          {row.catalogQuantity == null
                            ? "—"
                            : `${amount(row.catalogQuantity)} ${unitOf.get(String(row.ingredientId)) ?? ""}`}
                        </td>
                        <td>{row.locationName || "Not given"}</td>
                        <td>
                          {day(row.asOfAt)}
                          <small className="block text-ink-3">
                            {
                              COUNT_STATE_TEXT[
                                row.countState as OpeningStockCountState
                              ]
                            }
                          </small>
                        </td>
                        <td>
                          {row.status === "applied" ? (
                            "Used as opening stock."
                          ) : row.status === "set_aside" ? (
                            `Set aside: ${row.setAsideReason ?? ""}`
                          ) : issues.length === 0 ? (
                            "Nothing."
                          ) : (
                            <ul className="text-xs">
                              {issues.map((issue) => (
                                <li key={issue}>
                                  {OPENING_STOCK_ISSUE_TEXT[issue] ?? issue}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td>
                          {row.status === "needs_review" ||
                          row.status === "ready" ? (
                            <div className="supply-row-actions">
                              {row.status === "ready" &&
                              row.kind === "ingredient" ? (
                                <button
                                  className="btn btn-primary btn-sm"
                                  disabled={busy != null}
                                  onClick={() => void applyRow(row)}
                                >
                                  {busy === `${id}:apply`
                                    ? "Working…"
                                    : "Use as opening stock"}
                                </button>
                              ) : null}
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={busy != null}
                                onClick={() =>
                                  setEditing(editing === id ? null : id)
                                }
                              >
                                Fix
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={busy != null}
                                onClick={() => setRowAside(row)}
                              >
                                Set aside
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                      {editing === id ? (
                        <tr>
                          <td colSpan={8}>
                            <OpeningStockFixForm
                              record={row as never}
                              ingredients={(ingredients ?? []) as never}
                              components={(components ?? []) as never}
                              locations={(locations ?? []) as never}
                              busy={busy === `${id}:save`}
                              onSave={(values) => void save(id, values)}
                              onCancel={() => setEditing(null)}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-4 pb-3 text-xs text-ink-3">
          {formatCountNoun(all.length, "row")} in all.
        </p>
      </section>
    </div>
  );
}
