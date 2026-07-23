import { useState, type FormEvent } from "react";
import {
  useCreateVendorContract,
  useCreateVendorContractPriceTier,
  useListVendor,
  useListVendorContract,
  useListVendorContractPriceTier,
  useVendorContractActivate,
  useVendorContractMarkExpired,
  useVendorContractPriceTierRemove,
  useVendorContractTerminate,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import { SupplyFailureBanner } from "./SupplyFailureBanner";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_ALERT_DAYS = 30;

function daysUntil(endsAt: number): number {
  return Math.ceil((endsAt - Date.now()) / DAY_MS);
}

export function VendorContractsPage() {
  const contracts = useListVendorContract();
  const vendors = useListVendor();
  const tiers = useListVendorContractPriceTier();
  const createContract = useCreateVendorContract();
  const activateContract = useVendorContractActivate();
  const markExpired = useVendorContractMarkExpired();
  const terminateContract = useVendorContractTerminate();
  const createTier = useCreateVendorContractPriceTier();
  const removeTier = useVendorContractPriceTierRemove();
  const [showDraftForm, setShowDraftForm] = useState(false);
  const [tierFormContractId, setTierFormContractId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const activeVendors = (vendors ?? []).filter(
    (vendor) => vendor.deletedAt == null && vendor.status === "active",
  );
  const liveContracts = (contracts ?? []).filter(
    (contract) => contract.deletedAt == null,
  );
  const vendorName = (vendorId: string) =>
    vendors?.find((vendor) => vendor._id === vendorId)?.name ??
    "Unknown vendor";
  const contractTiers = (contractId: string) =>
    (tiers ?? []).filter(
      (tier) => tier.deletedAt == null && tier.contractId === contractId,
    );
  const expiringSoon = liveContracts.filter(
    (contract) =>
      contract.status === "active" &&
      contract.endsAt != null &&
      daysUntil(Number(contract.endsAt)) <= EXPIRY_ALERT_DAYS,
  );

  const run = async (key: string, work: () => Promise<void>) => {
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

  const submitDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);
    void run("draft", async () => {
      await createContract({
        vendorId: String(data.get("vendorId")),
        title: String(data.get("title")),
        startsAt: new Date(String(data.get("startsAt"))).getTime(),
        endsAt: new Date(String(data.get("endsAt"))).getTime(),
        contractNumber:
          String(data.get("contractNumber") ?? "").trim() || undefined,
        paymentTermsDays: Number(data.get("paymentTermsDays")),
        deliveryLeadTimeDays: Number(data.get("deliveryLeadTimeDays")),
        notes: String(data.get("notes") ?? "").trim() || undefined,
      });
      element.reset();
      setShowDraftForm(false);
    });
  };

  const submitTier = (
    event: FormEvent<HTMLFormElement>,
    contractId: string,
  ) => {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);
    void run(`${contractId}:tier`, async () => {
      await createTier({
        contractId,
        itemName: String(data.get("itemName")),
        unitPrice: Number(data.get("unitPrice")),
        unit: String(data.get("unit") ?? "").trim() || undefined,
        minQuantity: Number(data.get("minQuantity") ?? 0),
      });
      element.reset();
    });
  };

  const invokeContractAction = (contract: any, key: string) => {
    void (async () => {
      if (key === "terminate") {
        const reason = await prompt.askReason({
          ...ReasonCopy.terminateVendorContract,
          tone: "danger",
        });
        if (!reason) return;
        void run(`${contract._id}:${key}`, async () => {
          await terminateContract({
            docId: contract._id,
            version: contract.version,
            reason,
          });
        });
        return;
      }
      void run(`${contract._id}:${key}`, async () => {
        const args = { docId: contract._id, version: contract.version };
        if (key === "activate") await activateContract(args);
        if (key === "markExpired") await markExpired(args);
      });
    })();
  };

  return (
    <div className="operations-stage supply-stage">
      <header>
        <p className="eyebrow">Procurement</p>
        <h1 className="display-title mt-2">Vendor contracts</h1>
        <p className="mt-3 text-ink-2">
          Agreed pricing tiers, payment terms, and delivery lead times per
          vendor. Prices lock when a contract is activated.
        </p>
      </header>
      <InventoryWorkspaceNav />
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {host}

      {expiringSoon.length > 0 ? (
        <aside className="supply-degraded" role="alert">
          <strong>
            {expiringSoon.length} contract
            {expiringSoon.length === 1 ? "" : "s"} nearing expiry
          </strong>
          {expiringSoon.map((contract) => {
            const days = daysUntil(Number(contract.endsAt));
            return (
              <span key={contract._id}>
                {contract.title} · {vendorName(contract.vendorId)} ·{" "}
                {days <= 0
                  ? "period has ended — mark it expired or renegotiate"
                  : `expires in ${days} day${days === 1 ? "" : "s"}`}
              </span>
            );
          })}
        </aside>
      ) : null}

      <section className="order-controls">
        <div className="supply-row-actions">
          <button
            className="btn btn-primary"
            disabled={busy != null}
            onClick={() => setShowDraftForm((value) => !value)}
          >
            {showDraftForm ? "Close contract form" : "Draft contract"}
          </button>
        </div>
      </section>

      {showDraftForm ? (
        <form className="supply-form" onSubmit={submitDraft}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">New agreement</p>
              <h2>Draft vendor contract</h2>
            </div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "draft" ? "Drafting…" : "Draft"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label supply-span-2">
              Vendor
              <select name="vendorId" className="input" required>
                <option value="">Select vendor</option>
                {activeVendors.map((vendor) => (
                  <option key={vendor._id} value={vendor._id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label supply-span-2">
              Title
              <input name="title" className="input" required />
            </label>
            <label className="field-label">
              Contract number
              <input name="contractNumber" className="input" />
            </label>
            <label className="field-label">
              Starts
              <input name="startsAt" className="input" type="date" required />
            </label>
            <label className="field-label">
              Ends
              <input name="endsAt" className="input" type="date" required />
            </label>
            <label className="field-label">
              Payment terms (days)
              <input
                name="paymentTermsDays"
                className="input"
                type="number"
                min={0}
                max={365}
                defaultValue={30}
                required
              />
            </label>
            <label className="field-label">
              Delivery lead time (days)
              <input
                name="deliveryLeadTimeDays"
                className="input"
                type="number"
                min={0}
                max={365}
                defaultValue={0}
                required
              />
            </label>
            <label className="field-label supply-span-2">
              Notes
              <input name="notes" className="input" />
            </label>
          </div>
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Agreements</p>
            <h2>Contracts</h2>
          </div>
          <span>{liveContracts.length} contracts</span>
        </div>
        {contracts === undefined ||
        vendors === undefined ||
        tiers === undefined ? (
          <TableSkeleton rows={4} />
        ) : liveContracts.length === 0 ? (
          <div className="document-empty">
            <p>No vendor contracts yet.</p>
            <span>
              Draft a contract to lock in agreed pricing, payment terms, and
              lead times.
            </span>
          </div>
        ) : (
          <ul>
            {liveContracts.map((contract) => {
              const rows = contractTiers(contract._id);
              const endsAt =
                contract.endsAt != null ? Number(contract.endsAt) : null;
              const days = endsAt != null ? daysUntil(endsAt) : null;
              const isDraft = contract.status === "draft";
              const isActive = contract.status === "active";
              return (
                <li key={contract._id}>
                  <div className="order-line-summary">
                    <div>
                      <strong>{contract.title}</strong>
                      <span>
                        {vendorName(contract.vendorId)}
                        {contract.contractNumber
                          ? ` · #${contract.contractNumber}`
                          : ""}
                      </span>
                      <small>
                        {contract.startsAt != null && endsAt != null
                          ? `${new Date(Number(contract.startsAt)).toLocaleDateString()} → ${new Date(endsAt).toLocaleDateString()}`
                          : "Period not set"}
                        {" · "}Net {contract.paymentTermsDays} ·{" "}
                        {contract.deliveryLeadTimeDays} day lead
                      </small>
                    </div>
                    <div>
                      <StatusChip status={String(contract.status)} />
                      {isActive && days != null && days <= EXPIRY_ALERT_DAYS ? (
                        <span role="status">
                          {days <= 0
                            ? "Period ended"
                            : `Expires in ${days} day${days === 1 ? "" : "s"}`}
                        </span>
                      ) : null}
                    </div>
                    <div className="supply-row-actions">
                      {isDraft ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() =>
                            invokeContractAction(contract, "activate")
                          }
                        >
                          Activate
                        </button>
                      ) : null}
                      {isActive && days != null && days <= 0 ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() =>
                            invokeContractAction(contract, "markExpired")
                          }
                        >
                          Mark expired
                        </button>
                      ) : null}
                      {isDraft || isActive ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() =>
                            invokeContractAction(contract, "terminate")
                          }
                        >
                          Terminate
                        </button>
                      ) : null}
                      {isDraft ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() =>
                            setTierFormContractId((value) =>
                              value === contract._id ? null : contract._id,
                            )
                          }
                        >
                          Add price tier
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {rows.length > 0 ? (
                    <div
                      className="receipt-lot-history"
                      aria-label="Agreed price tiers"
                    >
                      <span>Agreed prices{isDraft ? "" : " (locked)"}</span>
                      <ul>
                        {rows.map((tier) => (
                          <li key={tier._id}>
                            <strong>{tier.itemName}</strong>
                            <span>
                              ${Number(tier.unitPrice).toFixed(2)} / {tier.unit}
                              {Number(tier.minQuantity) > 0
                                ? ` · min ${tier.minQuantity} ${tier.unit}`
                                : ""}
                            </span>
                            {isDraft ? (
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={busy != null}
                                onClick={() =>
                                  void run(`${tier._id}:remove`, async () => {
                                    await removeTier({
                                      docId: tier._id,
                                      version: tier.version,
                                    });
                                  })
                                }
                              >
                                Remove
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {tierFormContractId === contract._id && isDraft ? (
                    <form
                      className="receipt-form"
                      onSubmit={(event) => submitTier(event, contract._id)}
                    >
                      <label className="field-label">
                        Item
                        <input name="itemName" className="input" required />
                      </label>
                      <label className="field-label">
                        Unit price
                        <input
                          name="unitPrice"
                          className="input"
                          type="number"
                          min={0}
                          step="0.01"
                          required
                        />
                      </label>
                      <label className="field-label">
                        Unit
                        <input
                          name="unit"
                          className="input"
                          defaultValue="each"
                        />
                      </label>
                      <label className="field-label">
                        Min quantity
                        <input
                          name="minQuantity"
                          className="input"
                          type="number"
                          min={0}
                          step="any"
                          defaultValue={0}
                        />
                      </label>
                      <button
                        className="btn btn-primary"
                        disabled={busy != null}
                      >
                        {busy === `${contract._id}:tier`
                          ? "Adding…"
                          : "Add tier"}
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
