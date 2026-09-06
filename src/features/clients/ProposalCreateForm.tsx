import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useMutation } from "convex/react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type Doc, type Id } from "../../lib/api";
import { DraftRestoreBanner, useFormDraft } from "../../ui/formDraft";
import { clientDisplayName } from "../events/clientName";
import { CLIENTS_ROUTES } from "./clientsRoutes";
import { useCatalogDishes } from "./useCatalogDishes";
import {
  computeProposalPricing,
  PRICING_BASES,
  PRICING_BASIS_LABELS,
  type PricingBasis,
} from "../../lib/pricing";
import {
  BoundedDateInput,
  BoundedDateTimeLocalInput,
} from "../../ui/BoundedDateInputs";
import { toDatetimeLocalValue } from "../../lib/format";
import { useListProposalTemplate } from "../../lib/manifest-convex-react";
import { proposalTemplateDefaults } from "./proposalTemplateDefaults";

// In-memory pricing line in the draft form (spec §5.4). Numeric inputs are kept
// as strings for clean editing; parsed for the central calc on submit/preview.
// `menuDishId` links the line to a catalog MenuDish (spec §5.4 L276); when the
// price diverges from that dish's sellingPrice, `overrideReason` is required.
type DraftLine = {
  key: string;
  description: string;
  pricingBasis: PricingBasis;
  unitPrice: string;
  quantity: string;
  unit: string;
  menuDishId: string;
  overrideReason: string;
};

const dateValue = (value: FormDataEntryValue | null, endOfDay = false) => {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const timestamp = new Date(
    `${raw}T${endOfDay ? "23:59:59.999" : "12:00:00.000"}`,
  ).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
};

// datetime-local values already carry "YYYY-MM-DDTHH:MM" — parse as local time.
const datetimeLocalValue = (value: FormDataEntryValue | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const timestamp = new Date(raw).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
};

const defaultValidityDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateInputFromEpoch = (ms: number | null | undefined) => {
  if (ms == null || !Number.isFinite(ms)) return undefined;
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export type ProposalCreateFormProps = {
  /** Kept mounted while closed so in-progress draft lines survive the toggle. */
  open: boolean;
  fromEvent: Doc<"events"> | undefined;
  clients: Doc<"clients">[] | undefined;
  activeClients: Doc<"clients">[];
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => Promise<void>;
  onFailure: (error: unknown) => void;
  onNotice: (message: string) => void;
  onClose: () => void;
};

export function ProposalCreateForm({
  open,
  fromEvent,
  clients,
  activeClients,
  busy,
  run,
  onFailure,
  onNotice,
  onClose,
}: ProposalCreateFormProps) {
  const draftProposalWithLines = useMutation(
    api.lib.proposalDraft.draftProposalWithLines,
  );
  const draftForm = useFormDraft("proposal");
  // Published-catalog dishes a pricing line can be priced from (spec §5.4 L276).
  const catalog = useCatalogDishes();
  const proposalTemplates = useListProposalTemplate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromEventId = searchParams.get("event");

  const hasClientSource = Boolean(fromEvent) || activeClients.length > 0;
  const prefill = fromEvent
    ? {
        title: fromEvent.title ?? "",
        guestCount: Number(fromEvent.expectedHeadcount ?? 0),
        eventType: fromEvent.eventType ?? "",
        eventDate: dateInputFromEpoch(fromEvent.startsAt),
        eventEndDate:
          fromEvent.endsAt != null
            ? toDatetimeLocalValue(fromEvent.endsAt)
            : undefined,
        venueName: fromEvent.venueName ?? "",
        venueAddress: fromEvent.venueAddress ?? "",
      }
    : null;

  const lineSeqRef = useRef(0);
  const newDraftLine = (): DraftLine => ({
    key: `line-${lineSeqRef.current++}`,
    description: "",
    pricingBasis: "flat",
    unitPrice: "",
    quantity: "1",
    unit: "",
    menuDishId: "",
    overrideReason: "",
  });
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [draftGuestCount, setDraftGuestCount] = useState<number>(0);
  const [draftTax, setDraftTax] = useState<number>(0);
  const [draftDiscount, setDraftDiscount] = useState<number>(0);
  const [draftTerms, setDraftTerms] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftExpiresOn, setDraftExpiresOn] = useState(defaultValidityDate);
  const [draftVisibleSections, setDraftVisibleSections] = useState<string[]>(
    [],
  );

  // Live pricing preview via the ONE central calc (spec §5.4): lines → totals.
  const draftPricing = useMemo(
    () =>
      computeProposalPricing({
        lines: draftLines.map((l) => ({
          pricingBasis: l.pricingBasis,
          unitPrice: Number(l.unitPrice) || 0,
          quantity: Number(l.quantity) || 0,
        })),
        guestCount: draftGuestCount,
        discountAmount: draftDiscount,
        taxAmount: draftTax,
      }),
    [draftLines, draftGuestCount, draftTax, draftDiscount],
  );

  const updateLine = (key: string, field: keyof DraftLine, value: string) =>
    setDraftLines((lines) =>
      lines.map((l) =>
        l.key === key ? ({ ...l, [field]: value } as DraftLine) : l,
      ),
    );
  const removeLine = (key: string) =>
    setDraftLines((lines) => lines.filter((l) => l.key !== key));
  const addLine = () => setDraftLines((lines) => [...lines, newDraftLine()]);

  const selectTemplate = (templateId: string) => {
    const template = (proposalTemplates ?? []).find(
      (row) => row._id === templateId && row.status === "active",
    );
    if (!template) return;
    const defaults = proposalTemplateDefaults(template, draftPricing.subtotal);
    setDraftTerms(defaults.terms);
    setDraftNotes(defaults.notes);
    setDraftExpiresOn(defaults.expiresOn);
    setDraftTax(defaults.taxAmount);
    setDraftVisibleSections(defaults.visibleSections);
    const serviceChargeLine = defaults.serviceChargeLine;
    if (serviceChargeLine) {
      setDraftLines((lines) => [
        ...lines.filter(
          (line) =>
            !(
              line.pricingBasis === "percentage" &&
              line.description === "Service charge"
            ),
        ),
        {
          ...newDraftLine(),
          ...serviceChargeLine,
          quantity: String(serviceChargeLine.quantity),
          unitPrice: String(serviceChargeLine.unitPrice),
        },
      ]);
    }
  };

  // Link (or unlink) a draft line to a catalog dish (spec §5.4 L276). Picking a
  // dish autofills its name + sellingPrice; tweaking unitPrice away from that
  // price is an override that requires a reason before the proposal can be sent.
  const pickDish = (key: string, menuDishId: string) =>
    setDraftLines((lines) =>
      lines.map((l) => {
        if (l.key !== key) return l;
        if (!menuDishId) return { ...l, menuDishId: "", overrideReason: "" };
        const dish = catalog.lines.find((c) => c.menuDishId === menuDishId);
        if (!dish) return { ...l, menuDishId };
        return {
          ...l,
          menuDishId,
          description: dish.name,
          unitPrice:
            dish.sellingPrice == null ? l.unitPrice : String(dish.sellingPrice),
          overrideReason: "",
        };
      }),
    );
  const isOverride = (line: DraftLine) => {
    if (!line.menuDishId) return false;
    const dish = catalog.lines.find((c) => c.menuDishId === line.menuDishId);
    if (!dish || dish.sellingPrice == null) return false;
    return (
      Math.round((Number(line.unitPrice) + Number.EPSILON) * 100) / 100 !==
      dish.sellingPrice
    );
  };

  useEffect(() => {
    // "Create proposal" on an event navigates here with ?event=<id>; the form
    // opens prefilled from that event (spec §5.3 create-proposal-from-event).
    if (fromEvent) {
      setDraftGuestCount(Number(fromEvent.expectedHeadcount ?? 0));
    }
  }, [fromEvent?._id]);

  const submitDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const clientId = String(data.get("clientId") || "").trim();
    const title = String(data.get("title") || "").trim();
    if (!clientId || !title) {
      onFailure(new Error("Client and title are required."));
      return;
    }
    // Central calc (spec §5.4) derives the four stored totals from the priced
    // lines. A row with a price/quantity but no description would otherwise be
    // silently dropped here while the live preview counted it — validate instead
    // so preview and submit agree.
    const populatedLines = draftLines.filter(
      (line) =>
        line.description.trim().length > 0 ||
        line.unitPrice.trim().length > 0 ||
        line.quantity.trim().length > 0,
    );
    const lineMissingDescription = populatedLines.find(
      (line) => line.description.trim().length === 0,
    );
    if (lineMissingDescription) {
      onFailure(new Error("Every pricing line needs a description."));
      return;
    }
    const validLines = populatedLines;
    const pricing = computeProposalPricing({
      lines: validLines.map((line) => ({
        pricingBasis: line.pricingBasis,
        unitPrice: Number(line.unitPrice) || 0,
        quantity: Number(line.quantity) || 0,
      })),
      guestCount: draftGuestCount,
      discountAmount: draftDiscount,
      taxAmount: draftTax,
    });
    if (pricing.total < 0) {
      onFailure(new Error("Total cannot be negative."));
      return;
    }
    void run("draft-proposal", async () => {
      const eventIdRaw = String(data.get("eventId") || "").trim();
      // Create the proposal AND all its priced lines in one atomic server
      // transaction (convex/lib/proposalPricing.ts draftProposalWithLines): the
      // central calc derives authoritative totals + every line amount there, so
      // an interruption can never leave stored totals for lines not persisted.
      await draftProposalWithLines({
        clientId: clientId as Id<"clients">,
        title,
        guestCount: draftGuestCount,
        subtotal: pricing.subtotal,
        taxAmount: pricing.taxAmount,
        discountAmount: pricing.discountAmount,
        total: pricing.total,
        eventDate: dateValue(data.get("eventDate")),
        eventEndDate: datetimeLocalValue(data.get("eventEndDate")),
        eventType: String(data.get("eventType") || "").trim() || undefined,
        venueName: String(data.get("venueName") || "").trim() || undefined,
        venueAddress:
          String(data.get("venueAddress") || "").trim() || undefined,
        expiresAt: dateValue(data.get("expiresAt"), true),
        notes: String(data.get("notes") || "").trim() || undefined,
        terms: String(data.get("terms") || "").trim() || undefined,
        visibleSections: draftVisibleSections,
        eventId: eventIdRaw ? (eventIdRaw as Id<"events">) : undefined,
        lines: validLines.map((line, i) => ({
          description: line.description.trim(),
          pricingBasis: pricing.lines[i].pricingBasis,
          unitPrice: pricing.lines[i].unitPrice,
          quantity: pricing.lines[i].quantity ?? undefined,
          unit: line.unit.trim() || undefined,
          menuDishId: line.menuDishId
            ? (line.menuDishId as Id<"menuDishes">)
            : undefined,
          overrideReason: line.overrideReason.trim() || undefined,
        })),
      });
      form.reset();
      draftForm.clear();
      setDraftLines([]);
      setDraftTax(0);
      setDraftDiscount(0);
      setDraftTerms("");
      setDraftNotes("");
      setDraftExpiresOn(defaultValidityDate());
      setDraftVisibleSections([]);
      onClose();
      if (fromEventId) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("event");
        setSearchParams(nextParams, { replace: true });
      }
      onNotice(
        fromEventId
          ? "Proposal drafted and linked to the event. Publish and share it when ready."
          : "Proposal drafted. Publish and share it when ready.",
      );
    });
  };

  if (!open) return null;

  return (
    <form
      key={fromEvent?._id ?? "new-proposal"}
      className="supply-form"
      onSubmit={submitDraft}
      ref={draftForm.formRef}
    >
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Draft</p>
          <h2>{fromEvent ? "Proposal from event" : "New proposal"}</h2>
          {fromEvent ? (
            <p className="text-base text-ink-2">
              Linked to "{fromEvent.title}" — this proposal belongs to that
              event and its client.
            </p>
          ) : null}
        </div>
      </div>
      <DraftRestoreBanner
        draft={draftForm.draft}
        onRestore={draftForm.restore}
        onDiscard={draftForm.discard}
      />
      {!hasClientSource ? (
        <p className="text-base text-ink-2">
          No active clients.{" "}
          <Link className="text-link" to={CLIENTS_ROUTES.root}>
            Register a client
          </Link>{" "}
          first.
        </p>
      ) : (
        <>
          <div className="supply-form-grid">
            <label className="field-label supply-span-2">
              Proposal template
              <select
                className="input"
                defaultValue=""
                onChange={(event) => selectTemplate(event.target.value)}
              >
                <option value="">No template</option>
                {(proposalTemplates ?? [])
                  .filter((row) => row.status === "active")
                  .map((row) => (
                    <option key={row._id} value={row._id}>
                      {row.name}
                    </option>
                  ))}
              </select>
              <span className="text-2xs text-ink-3">
                Selecting a template initializes this draft. Your later edits
                stay unchanged.
              </span>
            </label>
            {fromEvent ? (
              <label className="field-label supply-span-2">
                Client
                <input
                  type="hidden"
                  name="clientId"
                  value={fromEvent.clientId}
                />
                <input type="hidden" name="eventId" value={fromEvent._id} />
                <input
                  className="input"
                  value={`${clientDisplayName(
                    fromEvent.clientId,
                    clients,
                  )} — from event "${fromEvent.title}"`}
                  disabled
                  readOnly
                />
              </label>
            ) : (
              <label className="field-label supply-span-2">
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
                  {activeClients.map((row) => (
                    <option key={row._id} value={row._id}>
                      {clientDisplayName(row._id, clients)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field-label">
              Title
              <input
                className="input"
                name="title"
                required
                defaultValue={prefill?.title ?? ""}
              />
            </label>
            <label className="field-label">
              Guest count
              <input
                className="input"
                name="guestCount"
                type="number"
                min={0}
                value={draftGuestCount}
                onChange={(e) =>
                  setDraftGuestCount(Number(e.target.value) || 0)
                }
              />
            </label>
            <label className="field-label">
              Event type
              <input
                className="input"
                name="eventType"
                defaultValue={prefill?.eventType ?? ""}
              />
            </label>
            <label className="field-label">
              Event date
              <BoundedDateInput
                className="input"
                name="eventDate"
                defaultValue={prefill?.eventDate}
              />
            </label>
            <label className="field-label">
              Event end
              <BoundedDateTimeLocalInput
                className="input"
                name="eventEndDate"
                defaultValue={prefill?.eventEndDate}
              />
            </label>
            <label className="field-label">
              Venue name
              <input
                className="input"
                name="venueName"
                defaultValue={prefill?.venueName ?? ""}
              />
            </label>
            <label className="field-label">
              Venue address
              <input
                className="input"
                name="venueAddress"
                defaultValue={prefill?.venueAddress ?? ""}
              />
            </label>
          </div>
          <div className="mt-4">
            <p className="eyebrow">Pricing</p>
            <p className="text-sm text-ink-2">
              Price per person, per unit, flat, percentage, or as a package. The
              subtotal and total update as you add lines.
            </p>
            {draftLines.length === 0 ? (
              <p className="mt-2 text-base text-ink-2">
                No pricing lines yet — add one to price the proposal.
              </p>
            ) : (
              <div className="supply-table-wrap mt-2">
                <table className="supply-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Basis</th>
                      <th>Catalog dish</th>
                      <th>Price / %</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Amount</th>
                      <th aria-label="Remove line" />
                    </tr>
                  </thead>
                  <tbody>
                    {draftLines.map((line, index) => (
                      <Fragment key={line.key}>
                        <tr>
                          <td>
                            <input
                              className="input"
                              value={line.description}
                              onChange={(e) =>
                                updateLine(
                                  line.key,
                                  "description",
                                  e.target.value,
                                )
                              }
                              placeholder="Line description"
                            />
                          </td>
                          <td>
                            <select
                              className="input"
                              value={line.pricingBasis}
                              onChange={(e) =>
                                updateLine(
                                  line.key,
                                  "pricingBasis",
                                  e.target.value,
                                )
                              }
                            >
                              {PRICING_BASES.map((basis) => (
                                <option key={basis} value={basis}>
                                  {PRICING_BASIS_LABELS[basis]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              className="input"
                              value={line.menuDishId}
                              onChange={(e) =>
                                pickDish(line.key, e.target.value)
                              }
                              disabled={catalog.loading}
                              aria-label="Link line to a catalog dish"
                            >
                              <option value="">— custom line —</option>
                              {catalog.lines.map((dish) => (
                                <option
                                  key={dish.menuDishId}
                                  value={dish.menuDishId}
                                >
                                  {dish.name}
                                  {dish.sellingPrice == null
                                    ? ""
                                    : ` · ${dish.sellingPrice.toFixed(2)}`}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className="input w-24"
                              type="number"
                              step="0.01"
                              min={0}
                              value={line.unitPrice}
                              onChange={(e) =>
                                updateLine(
                                  line.key,
                                  "unitPrice",
                                  e.target.value,
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="input w-20"
                              type="number"
                              step="0.01"
                              min={0}
                              value={line.quantity}
                              onChange={(e) =>
                                updateLine(line.key, "quantity", e.target.value)
                              }
                              disabled={line.pricingBasis !== "per_unit"}
                            />
                          </td>
                          <td>
                            <input
                              className="input w-20"
                              value={line.unit}
                              onChange={(e) =>
                                updateLine(line.key, "unit", e.target.value)
                              }
                              placeholder="tray, hr"
                              disabled={line.pricingBasis !== "per_unit"}
                            />
                          </td>
                          <td className="tabular-nums">
                            {(draftPricing.lines[index]?.amount ?? 0).toFixed(
                              2,
                            )}
                          </td>
                          <td>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => removeLine(line.key)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                        {isOverride(line) ? (
                          <tr>
                            <td colSpan={8}>
                              <label className="flex items-center gap-2">
                                <span className="field-label">
                                  Why the price changed
                                </span>
                                <input
                                  className="input flex-1"
                                  value={line.overrideReason}
                                  onChange={(e) =>
                                    updateLine(
                                      line.key,
                                      "overrideReason",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Why this price differs from the catalog"
                                />
                              </label>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button
              className="btn btn-ghost btn-sm mt-2"
              type="button"
              onClick={addLine}
            >
              Add line
            </button>
            <p className="mt-2 text-base text-ink-2">
              Subtotal (from lines):{" "}
              <span className="tabular-nums">
                {draftPricing.subtotal.toFixed(2)}
              </span>
            </p>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Tax
              <input
                className="input"
                name="taxAmount"
                type="number"
                step="0.01"
                min={0}
                value={draftTax}
                onChange={(e) => setDraftTax(Number(e.target.value) || 0)}
              />
              <span className="text-2xs text-ink-3">
                Template tax is calculated once from the current subtotal and
                service charge, then saved as this editable fixed amount.
              </span>
            </label>
            <label className="field-label">
              Discount
              <input
                className="input"
                name="discountAmount"
                type="number"
                step="0.01"
                min={0}
                value={draftDiscount}
                onChange={(e) => setDraftDiscount(Number(e.target.value) || 0)}
              />
            </label>
          </div>
          <p className="mt-3 text-base font-semibold text-ink">
            Total:{" "}
            <span className="tabular-nums">
              {draftPricing.total.toFixed(2)}
            </span>
          </p>
          <div className="supply-form-grid">
            <label className="field-label supply-span-2">
              Notes
              <textarea
                className="input"
                name="notes"
                rows={4}
                value={draftNotes}
                onChange={(event) => setDraftNotes(event.target.value)}
                placeholder="Client-facing notes"
              />
            </label>
            <label className="field-label">
              Valid through
              <BoundedDateInput
                className="input"
                name="expiresAt"
                value={draftExpiresOn}
                onChange={(event) => setDraftExpiresOn(event.target.value)}
              />
            </label>
            <label className="field-label supply-span-2">
              Terms
              <textarea
                className="input"
                name="terms"
                rows={3}
                value={draftTerms}
                onChange={(event) => setDraftTerms(event.target.value)}
                placeholder="Deposit, service, cancellation, or other terms"
              />
            </label>
          </div>
          <div className="supply-form-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy === "draft-proposal"}
            >
              Draft proposal
            </button>
          </div>
        </>
      )}
    </form>
  );
}
