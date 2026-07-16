export interface AuthStatusSnapshot {
  authenticated: boolean;
  hasRole: boolean;
  hasTenant: boolean;
}

/** Decides whether signed-in claims are enough to enter the workspace shell. */
export class WorkspaceMembershipPolicy {
  isReady(status: AuthStatusSnapshot): boolean {
    return status.hasRole && status.hasTenant;
  }

  missingRequirements(status: AuthStatusSnapshot): string {
    return [!status.hasTenant && "a workspace (tenantId)", !status.hasRole && "an operational role"]
      .filter(Boolean)
      .join(" and ");
  }
}

export const workspaceMembershipPolicy = new WorkspaceMembershipPolicy();
