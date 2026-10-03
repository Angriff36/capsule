import { useState } from "react";
import type { Doc, Id } from "../../lib/api";
import { useEventMoveToClient } from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
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
  const choices = (clients ?? [])
    .filter(
      (client) =>
        client.deletedAt == null &&
        client.status === "active" &&
        client._id !== clientId,
    )
    .map((client) => ({
      client,
      name: clientDisplayName(client._id, clients),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const next = choices.find((choice) => choice.client._id === nextClientId);

  return (
    <form
      className="space-y-3"
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        if (!next) return;
        const contact = useClientContact
          ? {
              primaryContactName: next.name,
              primaryContactEmail: next.client.email ?? undefined,
              primaryContactPhone: next.client.phone ?? undefined,
            }
          : {};
        void run(async () => {
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
        <select
          name="clientId"
          value={nextClientId}
          onChange={(changeEvent) => {
            const picked = choices.find(
              (choice) => choice.client._id === changeEvent.target.value,
            );
            setNextClientId(changeEvent.target.value);
            // A person client is usually the contact; a company is not.
            setUseClientContact(picked?.client.clientType === "person");
          }}
          className="input"
          disabled={!canChange || clients === undefined}
          title={blockedReason}
        >
          <option value="">Pick a client</option>
          {choices.map((choice) => (
            <option key={choice.client._id} value={choice.client._id}>
              {choice.name}
            </option>
          ))}
        </select>
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
        Proposals and contracts move with the event. Invoices and payments stay
        with the client they were billed to.
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
