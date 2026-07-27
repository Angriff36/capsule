const ROLE_DEFINITIONS = {
  staff: { parent: null, allow: ["staffAccess"] },
  kitchen_staff: { parent: "staff", allow: ["kitchenAccess"] },
  kitchen_lead: {
    parent: "kitchen_staff",
    allow: ["kitchenLeadAccess"],
  },
  sales_staff: { parent: "staff", allow: ["salesAccess"] },
  event_staff: { parent: "staff", allow: ["eventAccess"] },
  inventory_staff: { parent: "staff", allow: ["inventoryAccess"] },
  procurement_staff: {
    parent: "inventory_staff",
    allow: ["procurementAccess"],
  },
  logistics_staff: { parent: "staff", allow: ["logisticsAccess"] },
  driver: { parent: "logistics_staff", allow: [] },
  workforce_staff: { parent: "staff", allow: ["workforceAccess"] },
  finance_staff: { parent: "staff", allow: ["financeAccess"] },
  manager: { parent: "staff", allow: ["manageAccess", "importAccess"] },
  kitchen_manager: {
    parent: "manager",
    allow: ["kitchenAccess", "kitchenLeadAccess", "kitchenManageAccess"],
  },
  sales_manager: {
    parent: "manager",
    allow: ["salesAccess", "salesManageAccess"],
  },
  event_manager: {
    parent: "manager",
    allow: ["eventAccess", "eventManageAccess"],
  },
  inventory_manager: {
    parent: "manager",
    allow: ["inventoryAccess", "procurementAccess", "inventoryManageAccess"],
  },
  logistics_manager: {
    parent: "manager",
    allow: ["logisticsAccess", "logisticsManageAccess"],
  },
  workforce_manager: {
    parent: "manager",
    allow: ["workforceAccess", "workforceManageAccess"],
  },
  finance_manager: {
    parent: "manager",
    allow: ["financeAccess", "financeManageAccess"],
  },
  admin: {
    parent: "manager",
    allow: [
      "adminAccess",
      "kitchenAccess",
      "kitchenLeadAccess",
      "kitchenManageAccess",
      "salesAccess",
      "salesManageAccess",
      "eventAccess",
      "eventManageAccess",
      "inventoryAccess",
      "procurementAccess",
      "inventoryManageAccess",
      "logisticsAccess",
      "logisticsManageAccess",
      "workforceAccess",
      "workforceManageAccess",
      "financeAccess",
      "financeManageAccess",
    ],
  },
  owner: { parent: "admin", allow: [] },
  system: { parent: "admin", allow: [] },
} as const;

export type CapsuleRole = keyof typeof ROLE_DEFINITIONS;

export interface RolePermissionAuditMemberSource {
  _id: string;
  givenName: string;
  familyName: string;
  email: string;
  role: string;
  status: string;
  deletedAt?: unknown;
}

export interface RolePermissionAuditRow {
  id: string;
  displayName: string;
  email: string;
  status: string;
  role: string;
  roleLabel: string;
  manifestPolicies: readonly string[];
  elevatedPolicies: readonly string[];
  hasElevatedAccess: boolean;
}

export interface RolePermissionAuditSnapshot {
  generatedAt: string;
  members: readonly RolePermissionAuditRow[];
  activeMemberCount: number;
  elevatedMemberCount: number;
}

const ELEVATED_POLICIES = new Set([
  "manageAccess",
  "kitchenLeadAccess",
  "kitchenManageAccess",
  "salesManageAccess",
  "eventManageAccess",
  "inventoryManageAccess",
  "logisticsManageAccess",
  "workforceManageAccess",
  "financeManageAccess",
  "adminAccess",
]);

export function resolveManifestPolicies(role: string): readonly string[] {
  if (!isCapsuleRole(role)) return [];

  const inheritanceChain: (typeof ROLE_DEFINITIONS)[CapsuleRole][] = [];
  let currentRole: string | null = role;
  while (currentRole && isCapsuleRole(currentRole)) {
    const definition: (typeof ROLE_DEFINITIONS)[CapsuleRole] =
      ROLE_DEFINITIONS[currentRole];
    inheritanceChain.unshift(definition);
    currentRole = definition.parent;
  }

  return [
    ...new Set(inheritanceChain.flatMap((definition) => definition.allow)),
  ];
}

export function buildRolePermissionAuditSnapshot(
  members: readonly RolePermissionAuditMemberSource[],
  generatedAt = new Date(),
): RolePermissionAuditSnapshot {
  const rows = members
    .filter((member) => member.deletedAt == null)
    .map((member): RolePermissionAuditRow => {
      const manifestPolicies = resolveManifestPolicies(member.role);
      const elevatedPolicies = manifestPolicies.filter((policy) =>
        ELEVATED_POLICIES.has(policy),
      );
      const displayName = [member.givenName.trim(), member.familyName.trim()]
        .filter(Boolean)
        .join(" ");
      return {
        id: member._id,
        displayName: displayName || member.email,
        email: member.email,
        status: member.status,
        role: member.role,
        roleLabel: labelRole(member.role),
        manifestPolicies,
        elevatedPolicies,
        hasElevatedAccess: elevatedPolicies.length > 0,
      };
    })
    .sort(
      (left, right) =>
        left.displayName.localeCompare(right.displayName) ||
        left.email.localeCompare(right.email),
    );

  return {
    generatedAt: generatedAt.toISOString(),
    members: rows,
    activeMemberCount: rows.filter((member) => member.status === "active")
      .length,
    elevatedMemberCount: rows.filter((member) => member.hasElevatedAccess)
      .length,
  };
}

export function rolePermissionAuditToCsv(
  snapshot: RolePermissionAuditSnapshot,
): string {
  const rows = [
    [
      "snapshot_generated_at",
      "member_name",
      "email",
      "status",
      "assigned_role",
      "manifest_policies_satisfied",
      "elevated_access",
      "elevated_policies",
    ],
    ...snapshot.members.map((member) => [
      snapshot.generatedAt,
      member.displayName,
      member.email,
      member.status,
      member.role,
      member.manifestPolicies.join("; "),
      member.hasElevatedAccess ? "yes" : "no",
      member.elevatedPolicies.join("; "),
    ]),
  ];

  return (
    rows
      .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
      .join("\r\n") + "\r\n"
  );
}

function isCapsuleRole(role: string): role is CapsuleRole {
  return Object.prototype.hasOwnProperty.call(ROLE_DEFINITIONS, role);
}

function labelRole(role: string): string {
  return role
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function escapeCsvCell(value: string): string {
  const safeValue = /^[=+@-]/u.test(value) ? "'" + value : value;
  return '"' + safeValue.replaceAll('"', '""') + '"';
}
