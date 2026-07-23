import type { Doc } from "../../lib/api";
import { clientDisplayName } from "../events/clientName";

/** Key client fields for a hover preview — no navigation required. */
export function ClientPreviewCard({ client }: { client: Doc<"clients"> }) {
  const location = [client.city, client.region].filter(Boolean).join(", ");
  return (
    <span className="block space-y-1.5">
      <span className="block text-[13px] font-medium text-ink">
        {clientDisplayName(client._id, [client])}
      </span>
      <span className="block text-[11px] text-ink-3 capitalize">
        {client.clientType} · {client.status}
      </span>
      {client.email && (
        <span className="block truncate text-[12px] text-ink-2">
          {client.email}
        </span>
      )}
      {client.phone && (
        <span className="block text-[12px] text-ink-2">{client.phone}</span>
      )}
      {location && (
        <span className="block text-[12px] text-ink-2">{location}</span>
      )}
    </span>
  );
}
