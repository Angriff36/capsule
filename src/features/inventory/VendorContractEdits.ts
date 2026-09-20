import {
  useVendorContractPriceTierUpdate,
  useVendorContractUpdateTerms,
} from "../../lib/manifest-convex-react";
import type { ActionPromptSession } from "../../ui/action-prompt";
import { toDatetimeLocalValue } from "../../lib/format";

export type VendorContractRow = {
  _id: string;
  version: number;
  title: string;
  contractNumber?: string | null;
  paymentTermsDays?: number | null;
  deliveryLeadTimeDays?: number | null;
  startsAt?: number | null;
  endsAt?: number | null;
  documentUrl?: string | null;
  notes?: string | null;
};

export type VendorContractTierRow = {
  _id: string;
  version: number;
  itemName: string;
  unit?: string | null;
  minQuantity?: number | null;
  unitPrice?: number | null;
  notes?: string | null;
};

/** Optional command params: an empty box keeps the saved value. */
const text = (value: string | undefined): string | undefined =>
  value?.trim() ? value.trim() : undefined;

const localValue = (ms: number | null | undefined): string =>
  ms == null ? "" : toDatetimeLocalValue(Number(ms));

/**
 * Edit controls for a draft contract and its agreed price rows. Both commands
 * are refused once the contract is activated, so the page shows them on drafts.
 */
export function useVendorContractEdits(
  prompt: ActionPromptSession,
  run: (key: string, work: () => Promise<void>) => void,
) {
  const updateTerms = useVendorContractUpdateTerms();
  const updateTier = useVendorContractPriceTierUpdate();

  const editTerms = (contract: VendorContractRow) => {
    void (async () => {
      const values = await prompt.askFields({
        title: `Edit ${contract.title}`,
        description:
          "Terms stay editable while the contract is a draft. Activation locks the agreed prices and dates.",
        fields: [
          { name: "title", label: "Title", defaultValue: contract.title },
          {
            name: "startsAt",
            label: "Starts",
            inputType: "datetime-local",
            defaultValue: localValue(contract.startsAt),
          },
          {
            name: "endsAt",
            label: "Ends",
            inputType: "datetime-local",
            defaultValue: localValue(contract.endsAt),
          },
          {
            name: "contractNumber",
            label: "Contract number",
            defaultValue: contract.contractNumber ?? "",
            required: false,
          },
          {
            name: "paymentTermsDays",
            label: "Payment terms (days)",
            inputType: "number",
            defaultValue: String(contract.paymentTermsDays ?? 30),
          },
          {
            name: "deliveryLeadTimeDays",
            label: "Delivery lead time (days)",
            inputType: "number",
            defaultValue: String(contract.deliveryLeadTimeDays ?? 0),
          },
          {
            name: "documentUrl",
            label: "Document link",
            defaultValue: contract.documentUrl ?? "",
            required: false,
          },
          {
            name: "notes",
            label: "Notes",
            multiline: true,
            defaultValue: contract.notes ?? "",
            required: false,
          },
        ],
        confirmLabel: "Save terms",
      });
      if (!values) return;
      run(`${contract._id}:terms`, async () => {
        await updateTerms({
          docId: contract._id,
          version: contract.version,
          title: values.title.trim(),
          startsAt: new Date(values.startsAt).getTime(),
          endsAt: new Date(values.endsAt).getTime(),
          contractNumber: text(values.contractNumber),
          paymentTermsDays: Number(values.paymentTermsDays),
          deliveryLeadTimeDays: Number(values.deliveryLeadTimeDays),
          documentUrl: text(values.documentUrl),
          notes: text(values.notes),
        });
      });
    })();
  };

  const editTier = (tier: VendorContractTierRow) => {
    void (async () => {
      const values = await prompt.askFields({
        title: `Edit ${tier.itemName}`,
        description:
          "The agreed price for this item while the contract is a draft.",
        fields: [
          { name: "itemName", label: "Item", defaultValue: tier.itemName },
          {
            name: "unitPrice",
            label: "Unit price",
            inputType: "number",
            defaultValue: String(tier.unitPrice ?? 0),
          },
          { name: "unit", label: "Unit", defaultValue: tier.unit ?? "each" },
          {
            name: "minQuantity",
            label: "Min quantity",
            inputType: "number",
            defaultValue: String(tier.minQuantity ?? 0),
          },
          {
            name: "notes",
            label: "Notes",
            multiline: true,
            defaultValue: tier.notes ?? "",
            required: false,
          },
        ],
        confirmLabel: "Save price",
      });
      if (!values) return;
      run(`${tier._id}:update`, async () => {
        await updateTier({
          docId: tier._id,
          version: tier.version,
          itemName: values.itemName.trim(),
          unitPrice: Number(values.unitPrice),
          unit: text(values.unit),
          minQuantity: Number(values.minQuantity),
          notes: text(values.notes),
        });
      });
    })();
  };

  return { editTerms, editTier };
}
