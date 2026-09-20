import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { api, type Id } from "../api";
import { importSources } from "./importSources";
import { prepareNativeWorkbook } from "./prepareNativeWorkbook";
import type { EventPacketSnapshot, FieldValue } from "./model";
import type { PacketWorkbookSummary } from "./summaryProjection";

export interface PacketView {
  snapshot: EventPacketSnapshot;
  currentFingerprint: string;
  latestRevision: { id: string; fingerprint: string; stale: boolean } | null;
  nativeTargets?: Record<string, { id: string; label: string }[]>;
}
export interface PacketDecision {
  issueId: string;
  evidenceFingerprint: string;
  choice: FieldValue;
  reason: string;
  observationId?: string;
  answer?: "yes" | "no" | "not_applicable";
  unit?: string;
  nativeTargetId?: string;
  kind?: "fact_choice" | "fact_entry" | "verification";
}

/** Server-resolved capability for the event workbook panel. */
export function useEventPacketAccess(eventId: Id<"events">) {
  return useQuery(api.lib.eventPacket.commands.canManagePacket, { eventId });
}

/** Cross-event workbook rows; null means the viewer is not a manager. */
export function useEventWorkbookSummaries() {
  return useQuery(api.lib.eventPacket.commands.listPacketSummaries, {}) as
    PacketWorkbookSummary[] | null | undefined;
}

export function useEventPacket(eventId: Id<"events">) {
  const commands = api.lib.eventPacket.commands;
  const client = useConvex();
  const view = useQuery(commands.getPacket, { eventId }) as
    PacketView | undefined;
  const generateUploadUrl = useMutation(commands.generatePacketUploadUrl);
  const registerUpload = useAction(commands.registerPacketUpload);
  const importEvidence = useMutation(commands.importEvidence);
  const resolve = useMutation(commands.resolveOperationalIssue);
  const record = useMutation(commands.recordPacketRevision);
  const upload = async (file: {
    bytes: Uint8Array;
    mimeType: string;
    name: string;
    purpose: "source" | "pdf" | "snapshot";
    inputFingerprint?: string;
  }) => {
    const uploadUrl = await generateUploadUrl({ eventId });
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.mimeType },
      body: new Uint8Array(file.bytes).buffer,
    });
    if (!response.ok)
      throw new Error(`Packet upload failed (${response.status})`);
    const result = (await response.json()) as { storageId?: string };
    if (!result.storageId)
      throw new Error("Packet upload returned no storage id");
    return registerUpload({
      eventId,
      storageId: result.storageId as Id<"_storage">,
      name: file.name,
      mimeType: file.mimeType,
      purpose: file.purpose,
      inputFingerprint: file.inputFingerprint,
    });
  };
  return {
    view,
    upload,
    /** Live packet read for flows that must not act on a stale snapshot. */
    readPacket: () =>
      client.query(commands.getPacket, { eventId }) as Promise<PacketView>,
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

/**
 * Give source files to an event's workbook with no workbook panel on screen.
 * The event import calls this right after it makes the event, so the BEO that
 * made the event is also the workbook's source (owner rule, 2026-09-20: the
 * BEO import and the workbook import are one thing). Same steps as the
 * panel's own upload. Returns false when the files do not name one event.
 */
export function useAttachPacketSources() {
  const commands = api.lib.eventPacket.commands;
  const client = useConvex();
  return async (
    eventId: Id<"events">,
    files: { name: string; mimeType: string; bytes: Uint8Array }[],
    timeZone: string,
  ): Promise<boolean> => {
    const view = (await client.query(commands.getPacket, {
      eventId,
    })) as PacketView;
    const result = await importSources(files, {
      tenantId: view.snapshot.identity.tenantId,
      importedAt: new Date().toISOString(),
      existingArtifacts: view.snapshot.artifacts,
    });
    if (result.candidates.length !== 1) return false;
    const candidate = result.candidates[0];
    const included = [...candidate.sources, ...result.sharedReferences];
    const keys = new Set(included.map((source) => source.artifact.fingerprint));
    const snapshot: EventPacketSnapshot = {
      schemaVersion: 1,
      identity: { ...candidate.identity, eventId },
      artifacts: included.map((source) => source.artifact),
      observations: candidate.observations,
      facts: [],
      issues: [],
      resolutions: [],
      checklistVerifications: [],
      revisions: [],
      stage: "review",
    };
    const attached: { fingerprint: string; storageId: Id<"_storage"> }[] = [];
    for (const blob of result.artifactBytes) {
      if (!keys.has(blob.artifact.fingerprint)) continue;
      const uploadUrl = await client.mutation(
        commands.generatePacketUploadUrl,
        { eventId },
      );
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": blob.artifact.mimeType },
        body: new Uint8Array(blob.bytes).buffer,
      });
      if (!response.ok)
        throw new Error(`Packet upload failed (${response.status})`);
      const { storageId } = (await response.json()) as { storageId?: string };
      if (!storageId) throw new Error("Packet upload returned no storage id");
      const stored = await client.action(commands.registerPacketUpload, {
        eventId,
        storageId: storageId as Id<"_storage">,
        name: blob.artifact.name,
        mimeType: blob.artifact.mimeType,
        purpose: "source",
      });
      attached.push({
        fingerprint: blob.artifact.fingerprint,
        storageId: stored.storageId as Id<"_storage">,
      });
    }
    await client.mutation(commands.importEvidence, {
      eventId,
      snapshotJson: JSON.stringify(snapshot),
      artifacts: attached,
      timeZone,
    });
    return true;
  };
}
