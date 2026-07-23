import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { dishPath } from "./kitchenRoutes";
import type {
  MenuProfitabilityAnalysis,
  MenuProfitabilityRow,
  MenuProfitabilityStatus,
} from "./MenuProfitabilityAnalysis";
import "./MenuProfitabilityPanel.css";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function percentage(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function statusLabel(status: MenuProfitabilityStatus): string {
  if (status === "on_target") return "On target";
  if (status === "low_margin") return "Low margin";
  if (status === "missing_price") return "Price needed";
  return "Cost incomplete";
}

function guidance(row: MenuProfitabilityRow): string {
  if (row.status === "low_margin") {
    return "Reprice this dish or review its recipe ingredients.";
  }
  if (row.status === "missing_price" && !row.costComplete) {
    return "Set a selling price and complete its recipe costing.";
  }
  if (row.status === "missing_price") {
    return "Set a selling price to unlock its margin rank.";
  }
  if (row.status === "incomplete_cost") {
    return "Complete recipe pricing before trusting this margin.";
  }
  return "Healthy against the current food-cost target.";
}

export function MenuProfitabilityPanel({
  analysis,
  loading = false,
  busySelectionId = null,
  onReprice,
}: {
  analysis: MenuProfitabilityAnalysis;
  loading?: boolean;
  busySelectionId?: string | null;
  onReprice: (row: MenuProfitabilityRow, sellingPrice: number) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPrice, setDraftPrice] = useState("");
  const [priceError, setPriceError] = useState<string | null>(null);

  const beginReprice = (row: MenuProfitabilityRow) => {
    setEditingId(row.menuDishId);
    setDraftPrice(row.sellingPrice?.toFixed(2) ?? "");
    setPriceError(null);
  };

  const submitPrice = async (
    event: FormEvent<HTMLFormElement>,
    row: MenuProfitabilityRow,
  ) => {
    event.preventDefault();
    const nextPrice = Number(draftPrice);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      setPriceError("Enter a price of zero or more.");
      return;
    }
    setPriceError(null);
    try {
      await onReprice(row, nextPrice);
      setEditingId(null);
    } catch {
      // The parent owns the shared command failure banner; keep the editor open.
    }
  };

  return (
    <section
      className="menu-profitability"
      aria-labelledby="menu-profitability-heading"
      data-testid="menu-profitability-panel"
    >
      <header className="menu-profitability__header">
        <div>
          <p className="menu-profitability__eyebrow">Menu economics</p>
          <h2 id="menu-profitability-heading">Margin board</h2>
          <p>
            Live recipe cost against each dish's menu price, ranked by gross
            margin.
          </p>
        </div>
        <div className="menu-profitability__target" aria-label="Margin target">
          <span>Target</span>
          <strong>{analysis.grossMarginTarget.toFixed(0)}%+</strong>
          <small>gross margin</small>
        </div>
      </header>

      {loading ? (
        <div
          className="menu-profitability__loading"
          aria-label="Loading menu profitability"
        >
          <span />
          <span />
          <span />
        </div>
      ) : analysis.rows.length === 0 ? (
        <div className="menu-profitability__empty">
          <strong>No dishes to rank yet</strong>
          <p>Add dishes to this menu, then price them to see their margins.</p>
        </div>
      ) : (
        <>
          <dl className="menu-profitability__scoreboard">
            <div>
              <dt>Menu margin</dt>
              <dd data-testid="menu-portfolio-margin">
                {percentage(analysis.portfolioMarginPercent)}
              </dd>
              <small>
                {analysis.rankedDishCount
                  ? `${money.format(analysis.portfolioMarginAmount)} across priced dishes`
                  : "Waiting on complete price and cost data"}
              </small>
            </div>
            <div className={analysis.lowMarginCount ? "is-alert" : undefined}>
              <dt>Needs attention</dt>
              <dd data-testid="menu-low-margin-count">
                {analysis.lowMarginCount}
              </dd>
              <small>
                {analysis.lowMarginCount === 1
                  ? "dish below target"
                  : "dishes below target"}
              </small>
            </div>
            <div>
              <dt>Not ranked</dt>
              <dd>{analysis.unrankedDishCount}</dd>
              <small>missing price or recipe cost</small>
            </div>
          </dl>

          <div className="menu-profitability__legend" aria-hidden="true">
            <span>Rank</span>
            <span>Dish</span>
            <span>Sell</span>
            <span>Recipe cost</span>
            <span>Gross margin</span>
          </div>

          <div className="menu-profitability__rows">
            {analysis.rows.map((row) => {
              const editing = editingId === row.menuDishId;
              const busy = busySelectionId === row.menuDishId;
              return (
                <article
                  key={row.menuDishId}
                  className={`menu-profitability__row is-${row.status}`}
                  data-testid={`menu-profitability-row-${row.menuDishId}`}
                >
                  <div className="menu-profitability__rank">
                    {row.rank == null ? "—" : String(row.rank).padStart(2, "0")}
                  </div>
                  <div className="menu-profitability__dish">
                    <Link to={dishPath(row.dishId)}>{row.dishName}</Link>
                    <span>
                      {row.course || "Unassigned course"} · {row.recipeCount}{" "}
                      {row.recipeCount === 1 ? "recipe" : "recipes"}
                    </span>
                  </div>
                  <div className="menu-profitability__metric is-cost">
                    <span>Sell</span>
                    <strong>
                      {row.sellingPrice == null
                        ? "—"
                        : money.format(row.sellingPrice)}
                    </strong>
                  </div>
                  <div className="menu-profitability__metric">
                    <span>Recipe cost</span>
                    <strong>
                      {row.costComplete ? money.format(row.recipeCost) : "—"}
                    </strong>
                  </div>
                  <div className="menu-profitability__metric is-margin">
                    <span>Gross margin</span>
                    <strong>
                      {row.grossMarginAmount == null
                        ? "—"
                        : money.format(row.grossMarginAmount)}
                    </strong>
                    <em>{percentage(row.grossMarginPercent)}</em>
                  </div>
                  <div className="menu-profitability__status">
                    <span>{statusLabel(row.status)}</span>
                    {row.foodCostPercent != null ? (
                      <small>{percentage(row.foodCostPercent)} food cost</small>
                    ) : null}
                  </div>

                  <div className="menu-profitability__guidance">
                    <p>{guidance(row)}</p>
                    <div>
                      <Link to={dishPath(row.dishId)}>Review recipes</Link>
                      <button
                        type="button"
                        onClick={() => beginReprice(row)}
                        disabled={busy}
                      >
                        Reprice
                      </button>
                    </div>
                  </div>

                  {editing ? (
                    <form
                      className="menu-profitability__price-form"
                      onSubmit={(event) => void submitPrice(event, row)}
                    >
                      <label htmlFor={`menu-price-${row.menuDishId}`}>
                        Selling price
                      </label>
                      <div>
                        <span aria-hidden="true">$</span>
                        <input
                          id={`menu-price-${row.menuDishId}`}
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={draftPrice}
                          onChange={(event) =>
                            setDraftPrice(event.target.value)
                          }
                          autoFocus
                        />
                        <button type="submit" disabled={busy}>
                          {busy ? "Saving…" : "Save price"}
                        </button>
                        <button
                          type="button"
                          className="is-cancel"
                          onClick={() => setEditingId(null)}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </div>
                      {priceError ? <p role="alert">{priceError}</p> : null}
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
