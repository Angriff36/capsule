import { APIKeys } from "@clerk/react";
import { PageHeader, Section } from "../../ui/primitives";
import { AdminWorkspaceNav } from "./AdminWorkspaceNav";

/**
 * Personal API keys for remote agents. Clerk stores and verifies the keys;
 * a key acts as the Capsule user who created it (same tenant, same role) on
 * every command until it is revoked here.
 */
export function ApiKeysPage() {
  const base = `${window.location.origin}/api/manifest`;
  return (
    <div className="page">
      <PageHeader
        title="API keys"
        lead="Give a remote agent one key. It then uses the command API as you — same tenant, same permissions — until you revoke the key here."
      />
      <AdminWorkspaceNav />
      <Section title="Your keys">
        <APIKeys />
      </Section>
      <Section title="How an agent uses a key">
        <p className="text-ink-2">
          Send <code>Authorization: Bearer &lt;key&gt;</code> to{" "}
          <code>{base}/commands</code> to list commands, then{" "}
          <code>
            POST {base}/{"{Entity}"}/commands/{"{command}"}
          </code>{" "}
          to run one. The key is shown once at creation — copy it then.
        </p>
      </Section>
    </div>
  );
}
