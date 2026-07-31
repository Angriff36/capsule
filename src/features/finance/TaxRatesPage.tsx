import { useMemo, useState, type FormEvent } from "react";
import {
  useCreateTaxRate,
  useListInvoice,
  useListTaxRate,
  useTaxRateRevise,
  useTaxRateSetActive,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { formatMoneyExact } from "../../lib/format";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";
import { calculateTaxRemittance } from "./invoiceTax";
import "./taxWorkspace.css";

const usd = formatMoneyExact;

const applicability = (rate: {
  appliesToFood?: unknown;
  appliesToService?: unknown;
  appliesToRental?: unknown;
}) =>
  [
    rate.appliesToFood === true ? "Food" : null,
    rate.appliesToService === true ? "Service" : null,
    rate.appliesToRental === true ? "Rental" : null,
  ].filter((value): value is string => value != null);

export function TaxRatesPage() {
  const taxRates = useListTaxRate();
  const invoices = useListInvoice();
  const createTaxRate = useCreateTaxRate();
  const reviseTaxRate = useTaxRateRevise();
  const setActive = useTaxRateSetActive();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeRates = (taxRates ?? []).filter(
    (rate) => rate.deletedAt == null && rate.active === true,
  );
  const configuredRates = (taxRates ?? [])
    .filter((rate) => rate.deletedAt == null)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const editing = configuredRates.find((rate) => rate._id === editingId);
  const remittance = useMemo(
    () =>
      calculateTaxRemittance(
        (invoices ?? []) as Array<Record<string, unknown>>,
      ),
    [invoices],
  );
  const collectedTotal = remittance.reduce(
    (sum, row) => sum + row.collectedAmount,
    0,
  );
  const assessedTotal = remittance.reduce(
    (sum, row) => sum + row.assessedAmount,
    0,
  );

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    setFailure(null);
    setNotice(null);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitRate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const percentage = Number(data.get("percentage"));
    const appliesToFood = data.get("appliesToFood") === "on";
    const appliesToService = data.get("appliesToService") === "on";
    const appliesToRental = data.get("appliesToRental") === "on";
    if (!name) {
      setFailure(new Error("Give the tax rate a recognizable name."));
      return;
    }
    if (!(percentage > 0 && percentage <= 100)) {
      setFailure(
        new Error("Percentage must be greater than 0 and no more than 100."),
      );
      return;
    }
    if (!appliesToFood && !appliesToService && !appliesToRental) {
      setFailure(new Error("Choose at least one line-item category."));
      return;
    }

    const params = {
      name,
      percentage,
      appliesToFood,
      appliesToService,
      appliesToRental,
    };
    void run(editing ? `revise:${editing._id}` : "define", async () => {
      if (editing) {
        await reviseTaxRate({
          docId: editing._id,
          version: editing.version,
          ...params,
        });
      } else {
        await createTaxRate(params);
      }
      setEditingId(null);
      form.reset();
      setNotice(
        editing ? "Tax rate updated." : "Tax rate added and ready to apply.",
      );
    });
  };

  const toggleRate = (rate: {
    _id: string;
    version: number;
    active?: unknown;
    name?: unknown;
  }) => {
    const nextActive = rate.active !== true;
    void run(`active:${rate._id}`, async () => {
      await setActive({
        docId: rate._id,
        version: rate.version,
        active: nextActive,
      });
      setNotice(`${String(rate.name)} ${nextActive ? "activated" : "paused"}.`);
    });
  };

  if (taxRates === undefined || invoices === undefined) {
    return (
      <div className="operations-stage supply-stage tax-stage">
        <TableSkeleton rows={7} />
      </div>
    );
  }

  return (
    <div className="operations-stage supply-stage tax-stage">
      <header className="supply-masthead tax-masthead">
        <div>
          <p className="eyebrow">Finance · Tax desk</p>
          <h1 className="display-title mt-2">Rates &amp; remittance</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Name each jurisdictional rate once, mark what it applies to, and let
            invoice lines calculate the charge automatically.
          </p>
        </div>
        <div className="tax-period-stamp" aria-label="Tax configuration status">
          <span>Active rates</span>
          <strong>{activeRates.length}</strong>
          <small>{configuredRates.length} configured</small>
        </div>
      </header>
      <FinanceWorkspaceNav />
      {failure ? <FinanceFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}

      <section className="tax-config-grid">
        <form
          className="supply-form tax-rate-form"
          onSubmit={submitRate}
          key={editing?._id ?? "new-tax-rate"}
        >
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Configuration</p>
              <h2>{editing ? "Revise rate" : "Define a tax rate"}</h2>
            </div>
            {editing ? (
              <button
                className="text-link"
                type="button"
                onClick={() => setEditingId(null)}
              >
                Cancel
              </button>
            ) : null}
          </div>
          <label className="field-label">
            Rate name
            <input
              className="input"
              name="name"
              required
              defaultValue={String(editing?.name ?? "")}
              placeholder="State sales tax"
            />
          </label>
          <label className="field-label">
            Percentage
            <div className="tax-percent-input">
              <input
                className="input"
                name="percentage"
                type="number"
                min="0.0001"
                max="100"
                step="0.0001"
                required
                defaultValue={editing ? Number(editing.percentage) : ""}
                placeholder="7.2500"
              />
              <span>%</span>
            </div>
          </label>
          <fieldset className="tax-applicability-fieldset">
            <legend>Applies to</legend>
            <label>
              <input
                name="appliesToFood"
                type="checkbox"
                defaultChecked={editing?.appliesToFood === true}
              />
              <span>Food</span>
            </label>
            <label>
              <input
                name="appliesToService"
                type="checkbox"
                defaultChecked={editing?.appliesToService === true}
              />
              <span>Service</span>
            </label>
            <label>
              <input
                name="appliesToRental"
                type="checkbox"
                defaultChecked={editing?.appliesToRental === true}
              />
              <span>Rental</span>
            </label>
          </fieldset>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy != null}
          >
            {busy === "define" || busy?.startsWith("revise:")
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Add tax rate"}
          </button>
        </form>

        <div className="tax-rate-register">
          <div className="ledger-heading">
            <div>
              <p className="eyebrow">Rate register</p>
              <h2>Configured rates</h2>
            </div>
            <span>{configuredRates.length}</span>
          </div>
          {configuredRates.length === 0 ? (
            <div className="document-empty">
              <p>No tax rates yet.</p>
              <span>
                Add the first rate; invoice lines will begin matching it
                immediately.
              </span>
            </div>
          ) : (
            <div className="tax-rate-list">
              {configuredRates.map((rate) => (
                <article className="tax-rate-card" key={rate._id}>
                  <div>
                    <StatusChip
                      status={rate.active === true ? "active" : "paused"}
                    />
                    <h3>{String(rate.name)}</h3>
                    <div className="tax-category-chips">
                      {applicability(rate).map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                  </div>
                  <strong>{Number(rate.percentage).toFixed(4)}%</strong>
                  <div className="tax-rate-actions">
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => setEditingId(rate._id)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-link"
                      type="button"
                      disabled={busy != null}
                      onClick={() => toggleRate(rate)}
                    >
                      {rate.active === true ? "Pause" : "Activate"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="tax-remittance-ledger">
        <div className="tax-remittance-head">
          <div>
            <p className="eyebrow">Remittance</p>
            <h2>Collected tax by rate</h2>
            <p>
              Partial payments allocate tax proportionally. Voided invoices are
              excluded; assessed tax stays visible beside cash collected.
            </p>
          </div>
          <dl>
            <div>
              <dt>Assessed</dt>
              <dd>{usd(assessedTotal)}</dd>
            </div>
            <div>
              <dt>Collected</dt>
              <dd data-testid="collected-tax-total">{usd(collectedTotal)}</dd>
            </div>
          </dl>
        </div>
        {remittance.length === 0 ? (
          <div className="document-empty">
            <p>No invoice tax has been assessed yet.</p>
            <span>
              Named totals will appear after invoices are issued with taxed
              lines.
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Rate</th>
                  <th>Percentage</th>
                  <th>Invoices</th>
                  <th>Assessed</th>
                  <th>Collected</th>
                </tr>
              </thead>
              <tbody>
                {remittance.map((row) => (
                  <tr key={row.taxRateId}>
                    <td>{row.name}</td>
                    <td>{row.percentage}%</td>
                    <td>{row.invoiceCount}</td>
                    <td>{usd(row.assessedAmount)}</td>
                    <td className="tax-collected-cell">
                      {usd(row.collectedAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
