import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { api, type Id } from "../api";
import { prepareNativeWorkbook } from "./prepareNativeWorkbook";
import type { EventPacketSnapshot, FieldValue } from "./model";

export interface PacketView {
  snapshot: EventPacketSnapshot;
  currentFingerprint: string;
  latestRevision: { id: string; fingerprint: string; stale: boolean } | null;
  nativeTargets?: Record<string, { id: string; label: string }[]>;
}
export interface PacketDecision {
  issueId: string;
  choice: FieldValue;
  reason: string;
  observationId?: string;
  answer?: "yes" | "no" | "not_applicable";
  unit?: string;
  nativeTargetId?: string;
  kind?: "fact_choice" | "fact_entry" | "verification";
}

export function useEventPacket(eventId: Id<"events">) {
  const commands = api.lib.eventPacket.commands;
  const client = useConvex();
  const view = useQuery(commands.getPacket, { eventId }) as
    PacketView | undefined;
  const uploadFile = useAction(commands.uploadPacketFile);
  const importEvidence = useMutation(commands.importEvidence);
  const resolve = useMutation(commands.resolveOperationalIssue);
  const record = useMutation(commands.recordPacketRevision);
  const upload = async (file: {
    bytes: Uint8Array;
    mimeType: string;
    name: string;
    purpose: "source" | "pdf" | "snapshot";
    inputFingerprint?: string;
  }) =>
    uploadFile({ eventId, ...file, bytes: new Uint8Array(file.bytes).buffer });
  return {
    view,
    upload,
    importEvidence: (
      snapshot: EventPacketSnapshot,
      artifacts: { fingerprint: string; storageId: string }[],
      timeZone: string,
    ) =>
      importEvidence({
        eventId,
        snapshotJson: JSON.stringify(snapshot),
        artifacts: artifacts.map((a) => ({
          ...a,
          storageId: a.storageId as Id<"_storage">,
        })),
        timeZone,
      }),
    resolve: (decision: PacketDecision) => resolve({ eventId, ...decision }),
    sourceUrl: (fingerprint: string) =>
      client.query(commands.sourceUrl, { eventId, fingerprint }),
    revisionUrl: (revisionId: string) =>
      client.query(commands.revisionUrl, {
        eventId,
        revisionId: revisionId as Id<"eventPacketRevisions">,
      }),
    prepare: () =>
      prepareNativeWorkbook({
        read: async () =>
          (await client.query(commands.getPacket, { eventId })) as PacketView,
        upload,
        record: async (input) =>
          record({
            eventId,
            ...input,
            pdfStorageId: input.pdfStorageId as Id<"_storage">,
            snapshotStorageId: input.snapshotStorageId as Id<"_storage">,
          }),
      }),
  };
}
