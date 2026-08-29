import { useEffect, useRef, useState } from "react";

/** Roles every catering roster starts with; tenant data adds the rest. */
export const DEFAULT_STAFF_ROLES = [
  "Server",
  "Bartender",
  "Captain",
  "Event manager",
  "Chef",
  "Sous chef",
  "Prep cook",
  "Dishwasher",
  "Setup",
  "Driver",
] as const;

const OTHER = "__other";

/** Dropdown of known roles plus an "Other…" free-text escape hatch. */
export function collectStaffRoles(input: {
  readonly shiftTypeNames: readonly string[];
  readonly usedRoles: readonly string[];
}): string[] {
  const seen = new Map<string, string>();
  for (const raw of [
    ...DEFAULT_STAFF_ROLES,
    ...input.shiftTypeNames,
    ...input.usedRoles,
  ]) {
    const role = raw.trim();
    if (!role) continue;
    const key = role.toLowerCase();
    if (!seen.has(key)) seen.set(key, role);
  }
  return [...seen.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

/** Read the chosen role from a submitted form (select or the "Other" input). */
export function readStaffRole(data: FormData, name: string): string {
  const picked = String(data.get(name) ?? "").trim();
  if (picked === OTHER) return String(data.get(`${name}Other`) ?? "").trim();
  return picked;
}

export function StaffRoleSelect({
  name,
  roles,
  defaultRole,
}: {
  readonly name: string;
  readonly roles: readonly string[];
  readonly defaultRole?: string;
}) {
  const [other, setOther] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  // form.reset() puts the select back on its default; follow it.
  useEffect(() => {
    const form = selectRef.current?.form;
    if (!form) return;
    const onReset = () => setOther(false);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  return (
    <span className="flex flex-col gap-1">
      <select
        ref={selectRef}
        name={name}
        className="field-input"
        required
        defaultValue={defaultRole ?? roles[0] ?? OTHER}
        onChange={(event) => setOther(event.currentTarget.value === OTHER)}
      >
        {roles.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
        <option value={OTHER}>Other…</option>
      </select>
      {other ? (
        <input
          name={`${name}Other`}
          className="field-input"
          required
          placeholder="Role name"
          aria-label="Other role"
        />
      ) : null}
    </span>
  );
}
