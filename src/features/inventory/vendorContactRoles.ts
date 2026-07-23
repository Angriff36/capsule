// VendorContactRole enum labels (source: src/procurement/vendor.manifest).
export const VENDOR_CONTACT_ROLES = [
  { value: "account_rep", label: "Account rep" },
  { value: "dispatch", label: "Dispatch" },
  { value: "billing", label: "Billing" },
  { value: "general", label: "General" },
] as const;

export function vendorContactRoleLabel(role: string): string {
  return (
    VENDOR_CONTACT_ROLES.find((item) => item.value === role)?.label ?? role
  );
}
