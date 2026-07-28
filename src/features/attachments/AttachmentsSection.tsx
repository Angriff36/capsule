import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import {
  useAttachmentRemove,
  useCreateAttachment,
} from "../../lib/manifest-convex-react";
import { EmptyState, TableSkeleton } from "../../ui/primitives";

export type AttachmentParentType =
  | "eventRecord"
  | "client"
  | "contract"
  | "vendor"
  | "delivery"
  | "closeout"
  | "dish";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** File attachments (PDFs, images, spreadsheets) for one parent record. */
export function AttachmentsSection({
  parentType,
  parentId,
}: {
  parentType: AttachmentParentType;
  parentId: string;
}) {
  const attachments = useQuery(api.fileStorage.listForParent, {
    parentType,
    parentId,
  });
  const generateUploadUrl = useMutation(api.fileStorage.generateUploadUrl);
  const createAttachment = useCreateAttachment();
  const removeAttachment = useAttachmentRemove();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error(`Upload failed (${response.status})`);
      const { storageId } = (await response.json()) as { storageId: string };
      await createAttachment({
        parentType,
        parentId,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        fileSize: file.size,
        storageId,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <section className="working-ledger" data-testid="attachments-section">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Documents</p>
          <h2 className="text-lg font-semibold">Attachments</h2>
        </div>
        <div>
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? "Uploading…" : "Attach file"}
          </button>
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {attachments === undefined ? (
        <TableSkeleton rows={2} />
      ) : attachments.length === 0 ? (
        <EmptyState
          title="No files attached yet"
          hint="PDFs, images, and spreadsheets attached here stay with this record."
        />
      ) : (
        <ul className="mt-3 divide-y">
          {attachments.map((row) => (
            <li
              key={row._id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                {row.url ? (
                  <a
                    className="text-link text-[13px]"
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {row.fileName}
                  </a>
                ) : (
                  <span className="text-[13px]">{row.fileName}</span>
                )}
                <p className="text-[12px] text-ink-2">
                  {formatSize(row.fileSize)}
                  {row.uploadedAt
                    ? ` · ${formatDate(row.uploadedAt)} ${formatTime(row.uploadedAt)}`
                    : ""}
                  {row.uploadedById ? ` · uploaded by ${row.uploadedById}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  void removeAttachment({
                    docId: row._id,
                    version: row.version,
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
