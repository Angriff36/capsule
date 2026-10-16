/** Roles that may turn on Edit app and save wording or catalog swaps. */
const EDITOR_ROLES = new Set(["owner", "admin", "system"]);

export class StudioRoles {
  static canEdit(role: string | null | undefined): boolean {
    return EDITOR_ROLES.has(String(role ?? ""));
  }
}
