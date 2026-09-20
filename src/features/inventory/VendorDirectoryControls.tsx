import { useState } from "react";
import {
  useVendorContactRemove,
  useVendorContactUpdate,
  useVendorReinstate,
  useVendorSuspend,
  useVendorTerminate,
  useVendorUpdateDetails,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { SupplyFailureBanner } from "./SupplyFailureBanner";
import {
  VENDOR_CONTACT_ROLES,
  vendorContactRoleLabel,
} from "./vendorContactRoles";

export type VendorDirectoryVendor = {
  _id: string;
  version: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  paymentTermsDays?: number | null;
  notes?: string | null;
  status: string;
};

export type VendorDirectoryContact = {
  _id: string;
  version: number;
  vendorId: string;
  name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

/** Optional command params: an empty box keeps the saved value. */
const text = (value: string | undefined): string | undefined =>
  value?.trim() ? value.trim() : undefined;

export function VendorDirectoryControls({
  vendor,
  contacts,
  pageBusy,
  onAddContact,
}: {
  vendor: VendorDirectoryVendor;
  contacts: VendorDirectoryContact[];
  pageBusy: boolean;
  onAddContact: (vendorId: string) => void;
}) {
  const updateDetails = useVendorUpdateDetails();
  const suspendVendor = useVendorSuspend();
  const reinstateVendor = useVendorReinstate();
  const terminateVendor = useVendorTerminate();
  const updateContact = useVendorContactUpdate();
  const removeContact = useVendorContactRemove();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const locked = pageBusy || busy != null;
  const isActive = vendor.status === "active";
  const isSuspended = vendor.status === "suspended";
  const docRef = { docId: vendor._id, version: vendor.version };

  const run = (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(key);
    void (async () => {
      try {
        await work();
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(null);
      }
    })();
  };

  const editVendor = () => {
    void (async () => {
      const values = await prompt.askFields({
        title: `Edit ${vendor.name}`,
        description:
          "Contact and billing details for this supplier. A box left blank keeps its saved value.",
        fields: [
          { name: "name", label: "Vendor name", defaultValue: vendor.name },
          {
            name: "email",
            label: "Email",
            defaultValue: vendor.email ?? "",
            required: false,
          },
          {
            name: "phone",
            label: "Phone",
            defaultValue: vendor.phone ?? "",
            required: false,
          },
          {
            name: "addressLine1",
            label: "Address",
            defaultValue: vendor.addressLine1 ?? "",
            required: false,
          },
          {
            name: "city",
            label: "City",
            defaultValue: vendor.city ?? "",
            required: false,
          },
          {
            name: "region",
            label: "State / region",
            defaultValue: vendor.region ?? "",
            required: false,
          },
          {
            name: "postalCode",
            label: "Postal code",
            defaultValue: vendor.postalCode ?? "",
            required: false,
          },
          {
            name: "countryCode",
            label: "Country code",
            helper: "Two letters, for example US.",
            defaultValue: vendor.countryCode ?? "",
            required: false,
          },
          {
            name: "paymentTermsDays",
            label: "Payment terms (days)",
            inputType: "number",
            defaultValue: String(vendor.paymentTermsDays ?? 30),
          },
          {
            name: "notes",
            label: "Notes",
            multiline: true,
            defaultValue: vendor.notes ?? "",
            required: false,
          },
        ],
        confirmLabel: "Save vendor",
      });
      if (!values) return;
      run(`${vendor._id}:edit`, () =>
        updateDetails({
          ...docRef,
          name: values.name.trim(),
          email: text(values.email),
          phone: text(values.phone),
          addressLine1: text(values.addressLine1),
          city: text(values.city),
          region: text(values.region),
          postalCode: text(values.postalCode),
          countryCode: text(values.countryCode),
          paymentTermsDays: Number(values.paymentTermsDays),
          notes: text(values.notes),
        }),
      );
    })();
  };

  const suspend = () => {
    void (async () => {
      const reason = await prompt.askReason({
        title: `Suspend ${vendor.name}`,
        description:
          "A suspended vendor stays on the books but takes no new orders until you reinstate it.",
        label: "Suspension reason",
        placeholder: "e.g. Repeated short deliveries",
        confirmLabel: "Suspend vendor",
        tone: "danger",
      });
      if (!reason) return;
      run(`${vendor._id}:suspend`, () => suspendVendor({ ...docRef, reason }));
    })();
  };

  const terminate = () => {
    void (async () => {
      const reason = await prompt.askReason({
        title: `Terminate ${vendor.name} for good`,
        description:
          "Termination is final: the vendor leaves the supplier book and cannot be reinstated. Suspend it instead if the stop is temporary.",
        label: "Termination reason",
        placeholder: "e.g. Company closed",
        confirmLabel: "Terminate vendor permanently",
        tone: "danger",
      });
      if (!reason) return;
      run(`${vendor._id}:terminate`, () =>
        terminateVendor({ ...docRef, reason }),
      );
    })();
  };

  const editContact = (contact: VendorDirectoryContact) => {
    void (async () => {
      const values = await prompt.askFields({
        title: `Edit ${contact.name}`,
        description: `Who to call at ${vendor.name}. A box left blank keeps its saved value.`,
        fields: [
          { name: "name", label: "Contact name", defaultValue: contact.name },
          {
            name: "role",
            label: "Role",
            defaultValue: contact.role,
            options: VENDOR_CONTACT_ROLES.map((role) => ({ ...role })),
          },
          {
            name: "email",
            label: "Email",
            defaultValue: contact.email ?? "",
            required: false,
          },
          {
            name: "phone",
            label: "Phone",
            defaultValue: contact.phone ?? "",
            required: false,
          },
          {
            name: "notes",
            label: "Notes",
            multiline: true,
            defaultValue: contact.notes ?? "",
            required: false,
          },
        ],
        confirmLabel: "Save contact",
      });
      if (!values) return;
      run(`${contact._id}:edit`, () =>
        updateContact({
          docId: contact._id,
          version: contact.version,
          name: values.name.trim(),
          role: text(values.role),
          email: text(values.email),
          phone: text(values.phone),
          notes: text(values.notes),
        }),
      );
    })();
  };

  const removeContactRow = (contact: VendorDirectoryContact) => {
    void (async () => {
      const confirmed = await prompt.askConfirm({
        title: `Remove ${contact.name}`,
        description: `${contact.name} leaves the call list for ${vendor.name}. Add the contact again if you need it back.`,
        confirmLabel: "Remove contact",
        tone: "danger",
      });
      if (!confirmed) return;
      run(`${contact._id}:remove`, () =>
        removeContact({ docId: contact._id, version: contact.version }),
      );
    })();
  };

  return (
    <div>
      {contacts.map((contact) => (
        <small key={contact._id} className="block">
          {vendorContactRoleLabel(contact.role)} · {contact.name}
          {contact.phone ? ` · ${contact.phone}` : ""}
          {contact.email ? ` · ${contact.email}` : ""}
          <button
            type="button"
            className="btn btn-ghost btn-sm ml-2"
            disabled={locked}
            onClick={() => editContact(contact)}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={locked}
            onClick={() => removeContactRow(contact)}
          >
            Remove
          </button>
        </small>
      ))}
      <button
        type="button"
        className="text-link mt-1 self-start"
        onClick={() => onAddContact(vendor._id)}
      >
        + Add contact
      </button>
      <div className="supply-row-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={locked || !isActive}
          title={
            isActive ? undefined : "Only an active vendor's details can change."
          }
          onClick={editVendor}
        >
          Edit vendor
        </button>
        {isActive ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={locked}
            onClick={suspend}
          >
            Suspend
          </button>
        ) : null}
        {isSuspended ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={locked}
            onClick={() =>
              run(`${vendor._id}:reinstate`, () => reinstateVendor(docRef))
            }
          >
            Reinstate
          </button>
        ) : null}
        {isActive || isSuspended ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={locked}
            onClick={terminate}
          >
            Terminate
          </button>
        ) : null}
      </div>
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {host}
    </div>
  );
}
