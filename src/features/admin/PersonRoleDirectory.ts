/**
 * Closed Capsule role vocabulary for admin team-role assignment UI.
 * Mirrors `CapsuleRole` in `src/identity/person.manifest` / foundation roles.
 */
export class PersonRoleDirectory {
  static readonly ASSIGNABLE_ROLES = [
    "staff",
    "kitchen_staff",
    "kitchen_lead",
    "kitchen_manager",
    "sales_staff",
    "sales_manager",
    "event_staff",
    "event_manager",
    "inventory_staff",
    "inventory_manager",
    "procurement_staff",
    "logistics_staff",
    "logistics_manager",
    "driver",
    "workforce_staff",
    "workforce_manager",
    "finance_staff",
    "finance_manager",
    "manager",
    "admin",
    "owner",
  ] as const;

  static label(role: string): string {
    return role.replaceAll("_", " ");
  }

  static isAssignable(
    role: string,
  ): role is PersonRoleDirectory.AssignableRole {
    return (PersonRoleDirectory.ASSIGNABLE_ROLES as readonly string[]).includes(
      role,
    );
  }
}

export namespace PersonRoleDirectory {
  export type AssignableRole =
    (typeof PersonRoleDirectory.ASSIGNABLE_ROLES)[number];
}
