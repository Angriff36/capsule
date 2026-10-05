import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  useCreateClient,
  useCreateIngredient,
  useCreateVendor,
  useCreateVenue,
} from "../lib/manifest-convex-react";
import { useAuthStatus } from "../lib/useAuthStatus";
import { findLikelyDuplicates } from "../features/events/inlineRecordDuplicates";
import {
  VENUE_TYPES,
  type VenueTypeCode,
} from "../features/events/EventCreateInlineForms";
import { VenueCoordinatesFields } from "../features/facilities/VenueCoordinatesFields";
import { coordinatesFromFields } from "../features/facilities/venueCoordinates";
import { RecordPreviewSheet } from "./RecordPreviewSheet";

export type InlineReferenceKind = "client" | "ingredient" | "vendor" | "venue";
type ExistingOption = Readonly<{
  id: string;
  label: string;
  email?: string | null;
}>;
type AuthStatus = ReturnType<typeof useAuthStatus>;
type Props = Readonly<{
  kind: InlineReferenceKind;
  open: boolean;
  initialName: string;
  existingOptions: readonly ExistingOption[];
  onClose: () => void;
  onCreated: (record: { id: string; label: string }) => void;
  onUseExisting: (id: string) => void;
}>;

// Copied from generated ROLE_PERMISSIONS in convex/mutations.ts. The command
// remains authoritative; this prevents advertising an action it will deny.
export const CREATE_ROLES: Record<InlineReferenceKind, readonly string[]> = {
  client: ["admin", "owner", "sales_manager", "sales_staff", "system"],
  ingredient: [
    "admin",
    "kitchen_lead",
    "kitchen_manager",
    "kitchen_staff",
    "owner",
    "system",
  ],
  vendor: [
    "admin",
    "inventory_manager",
    "owner",
    "procurement_staff",
    "system",
  ],
  venue: ["admin", "event_manager", "owner", "system"],
};
const DISABLED_CAPABILITY: Record<InlineReferenceKind, string> = {
  client: "sales",
  ingredient: "kitchen",
  vendor: "procurement",
  venue: "events",
};
export const INGREDIENT_UNITS = [
  "each",
  "gram",
  "kilogram",
  "ounce",
  "pound",
  "milliliter",
  "liter",
  "teaspoon",
  "tablespoon",
  "cup",
  "pint",
  "quart",
  "gallon",
  "portion",
  "serving",
  "batch",
  "melon",
  "bottle",
  "fluid_ounce",
  "piece",
  "slice",
  "pizza",
  "package",
  "case",
  "can",
  "tub",
] as const;

/** Mirrors the generated create-command permissions and fails closed while loading. */
export function useCanCreateInlineReference(
  kind: InlineReferenceKind,
): boolean {
  return canCreateInlineReference(kind, useAuthStatus());
}
export function canCreateInlineReference(
  kind: InlineReferenceKind,
  auth: AuthStatus,
): boolean {
  return Boolean(
    auth &&
    CREATE_ROLES[kind].includes(auth.role ?? "") &&
    !auth.disabledCapabilities?.some(
      (capability) => capability === DISABLED_CAPABILITY[kind],
    ),
  );
}
function idempotencyKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `inline-reference-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function optional(data: FormData, field: string) {
  const value = String(data.get(field) ?? "").trim();
  return value || undefined;
}

export function InlineReferenceCreateSheet({
  kind,
  open,
  initialName,
  existingOptions,
  onClose,
  onCreated,
  onUseExisting,
}: Props) {
  const auth = useAuthStatus();
  const createClient = useCreateClient();
  const createIngredient = useCreateIngredient();
  const createVendor = useCreateVendor();
  const createVenue = useCreateVenue();
  const [name, setName] = useState(initialName);
  const [clientType, setClientType] = useState<"company" | "person">("company");
  const [familyName, setFamilyName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  const sessionKey = useRef(idempotencyKey());
  const submitting = useRef(false);
  const allowed = canCreateInlineReference(kind, auth);
  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setClientType("company");
    setFamilyName("");
    setEmail("");
    setBusy(false);
    setError(null);
    setConfirmedKey(null);
    sessionKey.current = idempotencyKey();
    submitting.current = false;
  }, [initialName, open]);
  const identity =
    kind === "client" && clientType === "person"
      ? [name.trim(), familyName.trim()].filter(Boolean).join(" ")
      : name.trim();
  const duplicateKey = JSON.stringify([
    clientType,
    identity.trim().toLowerCase(),
    email.trim().toLowerCase(),
  ]);
  const duplicates = useMemo(
    () =>
      findLikelyDuplicates(
        { name: identity, email: kind === "client" ? email : undefined },
        existingOptions.map((option) => ({
          _id: option.id,
          name: option.label,
          email: option.email,
        })),
      ),
    [email, existingOptions, identity, kind],
  );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy || submitting.current) return;
    const submittedName = name.trim();
    const latestDuplicates = findLikelyDuplicates(
      {
        name: identity,
        email: kind === "client" ? email : undefined,
      },
      existingOptions.map((option) => ({
        _id: option.id,
        name: option.label,
        email: option.email,
      })),
    );
    if (latestDuplicates.length && confirmedKey !== duplicateKey) return;
    if (!submittedName) {
      setError(`${kind[0].toUpperCase()}${kind.slice(1)} name is required.`);
      return;
    }
    const data = new FormData(event.currentTarget);
    const coordinates =
      kind === "venue"
        ? coordinatesFromFields(
            String(data.get("latitude") ?? ""),
            String(data.get("longitude") ?? ""),
          )
        : { ok: true as const, value: undefined };
    if (!coordinates.ok) {
      setError(coordinates.error);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result =
        kind === "client"
          ? await createClient({
              clientType,
              companyName: clientType === "company" ? submittedName : undefined,
              givenName: clientType === "person" ? submittedName : undefined,
              familyName: familyName.trim() || undefined,
              email: email.trim() || undefined,
              phone: optional(data, "phone"),
              paymentTermsDays: 30,
              taxExempt: false,
              idempotencyKey: sessionKey.current,
            })
          : kind === "ingredient"
            ? await createIngredient({
                name: submittedName,
                unit: String(data.get("unit") ?? "each"),
                costPerUnit: Number(data.get("costPerUnit") ?? 0),
                category: optional(data, "category"),
                idempotencyKey: sessionKey.current,
              })
            : kind === "vendor"
              ? await createVendor({
                  name: submittedName,
                  email: optional(data, "email"),
                  phone: optional(data, "phone"),
                  paymentTermsDays: 30,
                  idempotencyKey: sessionKey.current,
                })
              : await createVenue({
                  name: submittedName,
                  venueType: String(
                    data.get("venueType") ?? "other",
                  ) as VenueTypeCode,
                  capacity: Number(data.get("capacity") ?? 0),
                  addressLine1: optional(data, "addressLine1"),
                  city: optional(data, "city"),
                  region: optional(data, "region"),
                  postalCode: optional(data, "postalCode"),
                  latitude: coordinates.value?.latitude,
                  longitude: coordinates.value?.longitude,
                  idempotencyKey: sessionKey.current,
                });
      if (!result?.docId) {
        setError(`Could not create this ${kind}. Check the required fields.`);
        return;
      }
      onCreated({ id: String(result.docId), label: identity });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `Could not create this ${kind}.`,
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  return (
    <RecordPreviewSheet
      open={open}
      title={`Create ${kind}`}
      label="Reference record"
      description="Save this record and it will be selected without leaving your current form."
      onClose={onClose}
    >
      <div onSubmit={stop} onChange={stop} onInput={stop}>
        {!allowed ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-danger">
              You don't have permission to create a {kind}.
            </p>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={(event) => void submit(event)}>
            {duplicates.length && confirmedKey !== duplicateKey ? (
              <div className="attention-band px-3 py-2" role="status">
                <p className="text-sm font-semibold text-ink">
                  A similar {kind} already exists.
                </p>
                {duplicates.slice(0, 3).map((item) => (
                  <button
                    key={item._id}
                    type="button"
                    className="btn btn-secondary btn-sm mt-2 mr-2"
                    onClick={() => onUseExisting(item._id)}
                  >
                    Use existing {item.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm mt-2"
                  onClick={() => setConfirmedKey(duplicateKey)}
                >
                  Create anyway
                </button>
              </div>
            ) : null}
            <Fields
              kind={kind}
              name={name}
              clientType={clientType}
              familyName={familyName}
              email={email}
              onName={setName}
              onClientType={setClientType}
              onFamilyName={setFamilyName}
              onEmail={setEmail}
            />
            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-2">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Creating." : `Create and select ${kind}`}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </RecordPreviewSheet>
  );
}

function Fields({
  kind,
  name,
  clientType,
  familyName,
  email,
  onName,
  onClientType,
  onFamilyName,
  onEmail,
}: {
  kind: InlineReferenceKind;
  name: string;
  clientType: "company" | "person";
  familyName: string;
  email: string;
  onName: (value: string) => void;
  onClientType: (value: "company" | "person") => void;
  onFamilyName: (value: string) => void;
  onEmail: (value: string) => void;
}) {
  return (
    <>
      <>
        {kind === "client" ? (
          <label className="field-label">
            Type
            <select
              name="clientType"
              className="input"
              value={clientType}
              onChange={(event) =>
                onClientType(event.target.value as "company" | "person")
              }
            >
              <option value="company">Company</option>
              <option value="person">Person</option>
            </select>
          </label>
        ) : null}
        <label className="field-label">
          {kind === "client"
            ? clientType === "company"
              ? "Company name"
              : "Given name"
            : `${kind[0].toUpperCase()}${kind.slice(1)} name`}
          <input
            name="name"
            className="input"
            required
            autoFocus
            value={name}
            onChange={(event) => onName(event.target.value)}
          />
        </label>
        {kind === "client" && clientType === "person" ? (
          <label className="field-label">
            Family name
            <input
              name="familyName"
              className="input"
              value={familyName}
              onChange={(event) => onFamilyName(event.target.value)}
            />
          </label>
        ) : null}
      </>
      {kind === "ingredient" ? (
        <>
          <label className="field-label">
            Stock unit
            <select name="unit" className="input" defaultValue="each">
              {INGREDIENT_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Cost per unit
            <input
              name="costPerUnit"
              type="number"
              min="0"
              step="0.01"
              className="input"
              required
              defaultValue="0"
            />
          </label>
          <label className="field-label">
            Category
            <input name="category" className="input" />
          </label>
        </>
      ) : null}
      {kind === "venue" ? (
        <>
          <label className="field-label">
            Type
            <select name="venueType" className="input" defaultValue="other">
              {VENUE_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Capacity
            <input
              name="capacity"
              type="number"
              min="0"
              className="input"
              required
              defaultValue="0"
            />
          </label>
          <label className="field-label">
            Address
            <input name="addressLine1" className="input" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="field-label">
              City
              <input name="city" className="input" />
            </label>
            <label className="field-label">
              Region
              <input name="region" className="input" />
            </label>
          </div>
          <label className="field-label">
            Postal code
            <input name="postalCode" className="input" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <VenueCoordinatesFields compact />
          </div>
        </>
      ) : null}
      {kind === "client" || kind === "vendor" ? (
        <>
          <label className="field-label">
            Email
            <input
              name="email"
              type="email"
              className="input"
              value={email}
              onChange={(event) => onEmail(event.target.value)}
            />
          </label>
          <label className="field-label">
            Phone
            <input name="phone" type="tel" className="input" />
          </label>
        </>
      ) : null}
    </>
  );
}
