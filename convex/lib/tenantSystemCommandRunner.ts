import { getFunctionName, type FunctionReference } from "convex/server";
import type { MutationCtx } from "../_generated/server";
import * as generatedMutations from "../mutations";

/**
 * Runs generated commands inside the CURRENT transaction as the tenant's
 * `system` role.
 *
 * For consequences of a command the caller was already authorized to run,
 * where the consequence lives in a domain the caller's role does not hold:
 * event staff may reschedule an event (Event.reschedule), and moving that
 * event's open purchase needs to the new week is part of that reschedule —
 * not a separate purchasing decision — yet PurchaseNeed.moveToWeek and the
 * reactions it fans into (IngredientDemand, WeeklyPurchasingConfig) are
 * inventory/procurement-gated. Without this, the reschedule failed for the
 * very users allowed to make it.
 *
 * Scope of the elevation:
 * - only the commands this runner is handed run elevated; the caller's own
 *   identity, role and permissions are untouched, and nothing is granted to
 *   the caller for later calls;
 * - the tenant is pinned to the one the caller already proved membership in,
 *   so every generated `doc.tenantId !== auth.tenantId` check still holds;
 * - the tenant's own capability kill-switches still apply (the system role is
 *   subject to disabledCapabilities like any other role);
 * - guards, version checks, emitted events and reactions all run exactly as
 *   the generated command declares them — this substitutes the identity, not
 *   the command.
 *
 * How: the generated `mutation({ handler })` objects keep their handler as
 * `_handler` (the same hook convex-test invokes). Calling it with a ctx whose
 * `auth` answers as the tenant's system identity stays in-process and in the
 * same transaction. If a Convex upgrade ever drops `_handler`, the runner
 * falls back to the caller-auth `ctx.runMutation` — today's behaviour — rather
 * than failing in a new way.
 */
export class TenantSystemCommandRunner {
  private constructor(
    private readonly callerContext: MutationCtx,
    readonly tenantId: string,
  ) {}

  static forTenant(
    ctx: MutationCtx,
    tenantId: string,
  ): TenantSystemCommandRunner {
    if (tenantId.trim().length === 0) {
      throw new Error("A system command run needs the tenant it acts for");
    }
    return new TenantSystemCommandRunner(ctx, tenantId);
  }

  /**
   * A MutationCtx that authenticates as the tenant's system role. Hand it to
   * authored seams so every generated command THEY run (via `runMutation`)
   * is elevated too.
   */
  get context(): MutationCtx {
    const elevated: MutationCtx = {
      ...this.callerContext,
      auth: {
        getUserIdentity: async () => this.systemIdentity(),
      },
      runMutation: ((reference, ...args) =>
        this.runElevated(elevated, reference, args[0])) as MutationCtx["runMutation"],
    };
    return elevated;
  }

  private systemIdentity() {
    return {
      tokenIdentifier: `capsule-system|${this.tenantId}`,
      subject: `capsule-system:${this.tenantId}`,
      issuer: "capsule-system",
      tenantId: this.tenantId,
      role: "system",
    };
  }

  private async runElevated(
    elevated: MutationCtx,
    reference: FunctionReference<"mutation", "public" | "internal">,
    args: unknown,
  ): Promise<unknown> {
    const handler = generatedCommandHandler(reference);
    if (handler === null) {
      return this.callerContext.runMutation(
        reference,
        ...([args] as unknown as []),
      );
    }
    return handler(elevated, args ?? {});
  }
}

type CommandHandler = (ctx: MutationCtx, args: unknown) => Promise<unknown>;

/** The generated command's handler for a `mutations:*` reference, if reachable. */
function generatedCommandHandler(
  reference: FunctionReference<"mutation", "public" | "internal">,
): CommandHandler | null {
  const [module, exportName] = getFunctionName(reference).split(":");
  if (module !== "mutations" || exportName === undefined) return null;
  const registered = (generatedMutations as Record<string, unknown>)[
    exportName
  ] as { _handler?: unknown } | undefined;
  return typeof registered?._handler === "function"
    ? (registered._handler as CommandHandler)
    : null;
}
