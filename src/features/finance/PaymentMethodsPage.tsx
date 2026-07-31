import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreatePaymentMethod,
  useListClient,
  useListPaymentMethod,
  usePaymentMethodClearDefault,
  usePaymentMethodExpire,
  usePaymentMethodInvalidate,
  usePaymentMethodMakeDefault,
  usePaymentMethodReactivate,
  usePaymentMethodRemove,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { CLIENTS_ROUTES } from "../clients/clientsRoutes";
import { clientDisplayName } from "../events/clientName";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { FINANCE_ROUTES } from "./financeRoutes";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";
import { PaymentMethodLifecyclePolicy } from "./PaymentMethodLifecyclePolicy";

const policy = new PaymentMethodLifecyclePolicy();

const METHOD_TYPES = ["card", "check", "cash", "ach", "other"] as const;

type MethodType = (typeof METHOD_TYPES)[number];

export function PaymentMethodsPage() {
  const methods = useListPaymentMethod();
  const clients = useListClient();
  const createMethod = useCreatePaymentMethod();
  const makeDefault = usePaymentMethodMakeDefault();
  const clearDefault = usePaymentMethodClearDefault();
  const expire = usePaymentMethodExpire();
  const reactivate = usePaymentMethodReactivate();
  const invalidate = usePaymentMethodInvalidate();
  const remove = usePaymentMethodRemove();
  const [showRegister, setShowRegister] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const registeredClients = (clients ?? []).filter(
    (row) => row.deletedAt == null && row.registeredAt != null,
  );
  const activeRows = (methods ?? []).filter(
    (row) => row.deletedAt == null && row.registeredAt != null,
  );
  const visibleRows = showTerminal
    ? activeRows
    : activeRows.filter(
        (row) =>
          !["removed", "invalid", "fraudulent"].includes(String(row.status)),
      );

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitRegister = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const clientId = String(data.get("clientId") || "").trim();
    const methodType = String(data.get("methodType") || "card") as MethodType;
    const lastFourRaw = String(data.get("lastFour") || "").trim();
    const lastFour = lastFourRaw || undefined;
    if (!clientId) {
      setFailure(new Error("Select a registered client."));
      return;
    }
    if (lastFour && lastFour.length > 4) {
      setFailure(new Error("Last-four hint must be at most four characters."));
      return;
    }
    void run("register-method", async () => {
      await createMethod({
        clientId,
        methodType,
        provider: String(data.get("provider") || "").trim() || undefined,
        lastFour,
        isDefault: data.get("isDefault") === "on",
        notes: String(data.get("notes") || "").trim() || undefined,
      });
      form.reset();
      setShowRegister(false);
      setNotice("Payment method registered.");
    });
  };

  const invoke = (
    row: {
      _id: string;
      version: number;
      status: unknown;
      isDefault?: boolean | null;
    },
    key: string,
  ) => {
    void (async () => {
      if (key === "invalidate") {
        const reason = await prompt.askReason({
          title: "Invalidate payment method",
          description: "Record why this instrument can no longer be used.",
          label: "Invalidation reason",
          placeholder: "e.g. Card reported stolen",
          confirmLabel: "Invalidate",
          tone: "danger",
        });
        if (!reason) return;
        void run(`${row._id}:${key}`, async () => {
          await invalidate({ docId: row._id, version: row.version, reason });
          setNotice("Payment method invalidated.");
        });
        return;
      }
      void run(`${row._id}:${key}`, async () => {
        const args = { docId: row._id, version: row.version };
        if (key === "makeDefault") await makeDefault(args);
        if (key === "clearDefault") await clearDefault(args);
        if (key === "expire") await expire(args);
        if (key === "reactivate") await reactivate(args);
        if (key === "remove") await remove(args);
        setNotice(
          key === "remove"
            ? "Payment method removed."
            : `Payment method updated (${key}).`,
        );
      });
    })();
  };

  const loading = methods === undefined || clients === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Finance · Payment methods</p>
          <h1 className="display-title mt-2">Stored payment instruments</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Register a client payment instrument, set the default, then pick it
            when{" "}
            <Link className="text-link" to={FINANCE_ROUTES.payments}>
              recording a payment
            </Link>
            .
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setShowTerminal((value) => !value)}
          >
            {showTerminal ? "Hide removed" : "Show removed"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowRegister((value) => !value)}
          >
            {showRegister ? "Close form" : "Register method"}
          </button>
        </div>
      </header>
      <FinanceWorkspaceNav />
      {failure ? <FinanceFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      {showRegister ? (
        <form className="supply-form" onSubmit={submitRegister}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Register</p>
              <h2>New payment method</h2>
            </div>
          </div>
          {registeredClients.length === 0 ? (
            <p className="text-base text-ink-2">
              No registered clients.{" "}
              <Link className="text-link" to={CLIENTS_ROUTES.root}>
                Register a client
              </Link>{" "}
              first.
            </p>
          ) : (
            <>
              <label className="field-label">
                Client
                <select
                  className="input"
                  name="clientId"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select client
                  </option>
                  {registeredClients.map((client) => (
                    <option key={client._id} value={client._id}>
                      {clientDisplayName(client._id, clients)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="supply-form-grid">
                <label className="field-label">
                  Type
                  <select
                    className="input"
                    name="methodType"
                    defaultValue="card"
                  >
                    {METHOD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Provider
                  <input
                    className="input"
                    name="provider"
                    placeholder="e.g. Visa"
                  />
                </label>
                <label className="field-label">
                  Last four
                  <input
                    className="input"
                    name="lastFour"
                    maxLength={4}
                    placeholder="1234"
                    autoComplete="off"
                  />
                </label>
              </div>
              <label className="supply-check">
                <input name="isDefault" type="checkbox" />
                Set as default for this client
              </label>
              <label className="field-label">
                Notes
                <textarea className="input" name="notes" rows={2} />
              </label>
              <div className="supply-row-actions">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={busy != null}
                >
                  {busy === "register-method" ? "Registering…" : "Register"}
                </button>
              </div>
            </>
          )}
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Instruments</p>
            <h2>Payment methods</h2>
          </div>
          <span>{visibleRows.length} methods</span>
        </div>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : visibleRows.length === 0 ? (
          <div className="document-empty">
            <p>No payment methods yet.</p>
            <span>Register an instrument for a client before collecting.</span>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowRegister(true)}
              >
                Register method
              </button>
            </div>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Instrument</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <Link
                        className="text-link"
                        to={CLIENTS_ROUTES.detail(String(row.clientId))}
                      >
                        <strong>
                          {clientDisplayName(String(row.clientId), clients)}
                        </strong>
                      </Link>
                    </td>
                    <td>
                      <strong>{String(row.methodType)}</strong>
                      <small>
                        {[
                          row.provider ? String(row.provider) : null,
                          row.lastFour ? `····${String(row.lastFour)}` : null,
                          row.isDefault ? "default" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </small>
                    </td>
                    <td>
                      <StatusChip status={String(row.status)} />
                    </td>
                    <td>
                      <div className="supply-row-actions">
                        {policy
                          .methodActions(
                            String(row.status),
                            Boolean(row.isDefault),
                          )
                          .map((action) => (
                            <button
                              key={action.key}
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => invoke(row, action.key)}
                            >
                              {busy === `${row._id}:${action.key}`
                                ? "Working…"
                                : action.label}
                            </button>
                          ))}
                      </div>
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
