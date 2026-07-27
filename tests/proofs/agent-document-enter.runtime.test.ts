/**
 * DX proof: agent document-enter coordinator → governed createVia (+ dish) + idempotency.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { CapsuleCommandCatalog } from "../../src/agent/CapsuleCommandCatalog";
import type {
  CapsuleCommandExecutor,
  CapsuleCommandInvocation,
} from "../../src/agent/CapsuleCommandExecutor";
import { CapsuleDocumentEnterCoordinator } from "../../src/agent/CapsuleDocumentEnterCoordinator";
import type {
  CapsuleComponentLifecycleStatus,
  CapsuleComponentStatusReader,
} from "../../src/agent/CapsuleComponentStatusLoader";
import { modules } from "./convex-test-modules";

const SOURCE = readFileSync(
  fileURLToPath(
    new URL("../fixtures/agent/house-herb-oil.txt", import.meta.url),
  ),
  "utf8",
);

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

type ProofHarness = ReturnType<typeof harness>;
type RoleSession = ReturnType<ProofHarness["asRole"]>;

class ProofCommandExecutor implements CapsuleCommandExecutor {
  private readonly catalog = new CapsuleCommandCatalog();

  constructor(
    private readonly proof: ProofHarness,
    private readonly session: RoleSession,
  ) {}

  async execute(invocation: CapsuleCommandInvocation): Promise<unknown> {
    const descriptor = this.catalog.get(invocation.capabilityId);
    const mutationTable = api.mutations as unknown as Record<string, unknown>;
    const mutation = mutationTable[descriptor.mutationName];
    if (!mutation) {
      throw new Error(`Missing mutation ${descriptor.mutationName}`);
    }
    const args = {
      ...invocation.args,
      ...(invocation.idempotencyKey
        ? { idempotencyKey: invocation.idempotencyKey }
        : {}),
    };
    return this.proof.executeCommand(
      this.session,
      mutation as never,
      args as Record<string, unknown>,
    );
  }
}

/** Harness-backed status reader — never hits live Convex HTTP/OIDC. */
class ProofComponentStatusReader implements CapsuleComponentStatusReader {
  constructor(private readonly session: RoleSession) {}

  async loadStatus(
    componentId: string,
  ): Promise<CapsuleComponentLifecycleStatus> {
    return this.session.run(async (ctx) => {
      const row = await ctx.db.get(componentId as never);
      if (!row || (row as { deletedAt?: number | null }).deletedAt != null) {
        return "missing";
      }
      const status = (row as { status?: string }).status;
      if (
        status === "draft" ||
        status === "published" ||
        status === "retired"
      ) {
        return status;
      }
      return "missing";
    });
  }
}

function enterCoordinator(
  proof: ProofHarness,
  session: RoleSession,
): CapsuleDocumentEnterCoordinator {
  return new CapsuleDocumentEnterCoordinator(
    new ProofCommandExecutor(proof, session),
    new ProofComponentStatusReader(session),
  );
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: agent document enter", () => {
  it("enters fixture component document as ingredients + component + dish", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "agent-doc-enter",
      role: "kitchen_manager",
      tenantId: "tenant-agent-enter",
    });
    const coordinator = enterCoordinator(proof, kitchen);

    const preview = coordinator.previewFromText({ sourceText: SOURCE });
    expect(preview.unresolvedLineCount).toBeGreaterThan(0);
    await expect(
      coordinator.enterFromText({ sourceText: SOURCE }),
    ).rejects.toThrow(/unresolved ingredient/i);

    const first = await coordinator.enterFromText({
      sourceText: SOURCE,
      approveUnresolvedAsNew: true,
      introduceDish: true,
    });
    expect(first.componentId).toBeTruthy();
    expect(first.dishId).toBeTruthy();
    expect(first.createdIngredientIds.length).toBeGreaterThan(0);

    const snapshot = await kitchen.run(async (ctx) => {
      const component = await ctx.db.get(first.componentId as never);
      const dish = first.dishId
        ? await ctx.db.get(first.dishId as never)
        : null;
      const ingredients = await ctx.db.query("ingredients").collect();
      const lines = await ctx.db.query("componentIngredients").collect();
      const dishComponents = await ctx.db.query("dishComponents").collect();
      const dishes = await ctx.db.query("dishes").collect();
      return { component, dish, ingredients, lines, dishComponents, dishes };
    });

    expect(snapshot.component).toMatchObject({
      name: "House Herb Oil",
      yieldQuantity: 2,
      yieldUnit: "cup",
      tenantId: "tenant-agent-enter",
    });
    expect(snapshot.dish).toMatchObject({
      name: "House Herb Oil",
      tenantId: "tenant-agent-enter",
    });
    expect(
      snapshot.dishComponents.some(
        (link) =>
          link.dishId === first.dishId &&
          link.componentId === first.componentId,
      ),
    ).toBe(true);
    expect(
      snapshot.lines.filter((line) => line.componentId === first.componentId),
    ).toHaveLength(3);
    expect(snapshot.ingredients.some((i) => i.name === "Olive Oil")).toBe(true);

    const second = await coordinator.enterFromText({
      sourceText: SOURCE,
      approveUnresolvedAsNew: true,
      introduceDish: true,
    });
    expect(second.componentId).toBe(first.componentId);
    expect(second.dishId).toBe(first.dishId);

    const afterRetry = await kitchen.run(async (ctx) => {
      const components = await ctx.db.query("components").collect();
      const dishes = await ctx.db.query("dishes").collect();
      return {
        componentCount: components.filter((r) => r.name === "House Herb Oil")
          .length,
        dishCount: dishes.filter((d) => d.name === "House Herb Oil").length,
      };
    });
    expect(afterRetry.componentCount).toBe(1);
    expect(afterRetry.dishCount).toBe(1);
  });

  it("denies document enter without kitchen access", async () => {
    const proof = harness();
    const outsider = proof.asRole({
      subject: "agent-doc-denied",
      role: "workforce_staff",
      tenantId: "tenant-agent-deny",
    });
    const coordinator = enterCoordinator(proof, outsider);
    await expect(
      coordinator.enterFromText({
        sourceText: SOURCE,
        approveUnresolvedAsNew: true,
      }),
    ).rejects.toThrow(/Kitchen staff/i);
  });
});
