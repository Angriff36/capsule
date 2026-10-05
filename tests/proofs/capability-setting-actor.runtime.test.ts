/**
 * Runtime proof (PL-AUTH, AC-210 / AC-372 area switch actor): the person an
 * area on/off switch records as the one who changed it comes from the
 * sign-in, never from the caller. OrganizationCapabilitySetting register and
 * setEnabled used to take an optional updatedBy, so an admin could write any
 * name as the one who turned an area off, and the Permissions screen, which
 * never sent one, left it blank. Now a supplied updatedBy is refused and
 * every change records the signed-in person. Synthetic workspaces only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;
type SettingRow = { enabled: boolean; updatedBy: string | null };

async function readSetting(actor: Actor, id: string) {
  return (await actor.run(async (ctx) => {
    const db = (
      ctx as unknown as {
        db: { get: (id: string) => Promise<SettingRow | null> };
      }
    ).db;
    return db.get(id);
  })) as SettingRow | null;
}

async function refused(call: () => Promise<unknown>) {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}

describe("runtime proof: area switches record the signed-in person (AC-210 / AC-372)", () => {
  it("refuses a supplied updatedBy and records who is signed in", async () => {
    const proof = harness();
    const tenantId = "tenant-capability-setting-actor";
    const owner = proof.asRole({
      subject: "capability-actor-owner",
      role: "owner",
      tenantId,
    });
    const admin = proof.asRole({
      subject: "capability-actor-admin",
      role: "admin",
      tenantId,
    });

    // A caller can no longer name someone else when turning an area off.
    expect(
      await refused(() =>
        admin.mutation(
          api.mutations.OrganizationCapabilitySetting_createViaRegister,
          {
            capability: "kitchen",
            enabled: false,
            updatedBy: "capability-actor-owner",
          } as never,
        ),
      ),
    ).toBe(true);

    // Without it (what the Permissions screen sends), the switch records the
    // signed-in admin instead of leaving the name blank.
    const { docId: settingId } = (await admin.mutation(
      api.mutations.OrganizationCapabilitySetting_createViaRegister,
      { capability: "kitchen", enabled: false } as never,
    )) as { docId: string };
    let row = await readSetting(owner, settingId);
    expect(row?.enabled).toBe(false);
    expect(row?.updatedBy).toBe("capability-actor-admin");

    expect(
      await refused(() =>
        owner.mutation(api.mutations.OrganizationCapabilitySetting_setEnabled, {
          docId: settingId,
          enabled: true,
          updatedBy: "capability-actor-admin",
        } as never),
      ),
    ).toBe(true);
    row = await readSetting(owner, settingId);
    expect(row?.enabled).toBe(false);
    expect(row?.updatedBy).toBe("capability-actor-admin");

    await owner.mutation(
      api.mutations.OrganizationCapabilitySetting_setEnabled,
      {
        docId: settingId,
        enabled: true,
      } as never,
    );
    row = await readSetting(owner, settingId);
    expect(row?.enabled).toBe(true);
    expect(row?.updatedBy).toBe("capability-actor-owner");
  });
});
