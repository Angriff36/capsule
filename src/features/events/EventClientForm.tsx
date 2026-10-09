import { useEffect, useState } from "react";
import type { Doc, Id } from "../../lib/api";
import { useEventMoveToClient } from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { useClientsByIds, useReadClient } from "../../lib/useClientDirectory";
import { ClientSearchSelect } from "../clients/ClientSearchSelect";
import { resolveManifestPolicies } from "../admin/rolePermissionAudit";
import { clientDisplayName } from "./clientName";

interface EventClientFormProps {
  eventId: Id<"events">;
  version: number | undefined;
  clientId?: string | null;
  clients: Doc<"clients">[] | undefined;
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<void>;
}

/**
 * Move the event to a different client (#378). Proposals and contracts move
 * with it (Event.moveToClient reactions); invoices and payments stay with the
 * client they were billed to. Needs sales access, the same as the command's
 * own guard.
 */
export function EventClientForm({
  eventId,
  version,
  clientId,
  clients,
  busy,
  run,
}: EventClientFormProps) {
  const authStatus = useAuthStatus();
  const moveToClient = useEventMoveToClient();
  const [nextClientId, setNextClientId] = useState("");
  const [useClientContact, setUseClientContact] = useState(false);

  const canChange = resolveManifestPolicies(authStatus?.role ?? "").includes(
    "salesAccess",
  );
  const blockedReason = canChange
    ? undefined
    : "Moving an event to another client needs sales access";
  // The picker searches the server; only the picked client is read here.
  const picked = useClientsByIds(nextClientId ? [nextClientId] : []);
  const readClient = useReadClient();
  const nextClient =
    nextClientId && nextClientId !== clientId
      ? picked?.find((row) => row._id === nextClientId)
      : undefined;
  const next = nextClient
    ? {
        client: nextClient,
        name: clientDisplayName(nextClient._id, [nextClient]),
      }
    : undefined;
  // A person client is usually the contact; a company is not.
  const nextType = next?.client.clientType;
  useEffect(() => {
    if (nextType) setUseClientContact(nextType === "person");
  }, [nextType]);

  return (
    <form
      className="space-y-3"
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        if (!next) return;
        void run(async () => {
          // Email and phone are locked fields: read them from the client.
          const full = useClientContact
            ? await readClient(String(next.client._id))
            : null;
          const contact = useClientContact
            ? {
                primaryContactName: next.name,
                primaryContactEmail: full?.email ?? undefined,
                primaryContactPhone: full?.phone ?? undefined,
              }
            : {};
          await moveToClient({
            docId: eventId,
            version,
            clientId: next.client._id,
            ...contact,
          });
          setNextClientId("");
          setUseClientContact(false);
        });
      }}
    >
      <p className="text-sm text-ink-2">
        Now: {clientDisplayName(clientId, clients)}
      </p>
      <label className="field-label">
        <span>Move to client</span>
        <ClientSearchSelect
          name="clientId"
          value={nextClientId}
          onChange={setNextClientId}
          placeholder="Type a client's name…"
          aria-label="Move to client"
          disabled={!canChange}
        />
      </label>
      {next ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useClientContact}
            onChange={(changeEvent) =>
              setUseClientContact(changeEvent.target.checked)
            }
          />
          <span>Also make {next.name} the event contact</span>
        </label>
      ) : null}
      <p className="text-xs text-ink-3">
        Proposals, contracts and unsent draft invoices move with the event. Sent
        or paid invoices and payments stay with the client billed.
      </p>
      <button
        type="submit"
        className="btn btn-primary min-h-10"
        disabled={!canChange || busy || !next}
        title={blockedReason}
      >
        Move event
      </button>
    </form>
  );
}
