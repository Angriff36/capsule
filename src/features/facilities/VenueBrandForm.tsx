import { useState } from "react";
import type { Doc } from "../../lib/api";
import {
  useGenerateUploadUrl,
  useVenueLogoUrl,
} from "../../lib/fileStorageClient";
import { useVenueSetBrand } from "../../lib/manifest-convex-react";

const HEX_COLOR = /^#[0-9a-f]{6}$/iu;

/**
 * Co-branded proposals (Venue Partner Playbook section 06): the partner
 * venue's logo and brand colour. Proposals sent for events here show this
 * logo next to the company's, with the colour as the accent.
 */
export function VenueBrandForm({
  venue,
  run,
  busy,
}: {
  venue: Doc<"venues">;
  run: (key: string, work: () => Promise<unknown>) => Promise<void>;
  busy: string | null;
}) {
  const setBrand = useVenueSetBrand();
  const generateUploadUrl = useGenerateUploadUrl();
  const logoUrl = useVenueLogoUrl(String(venue._id));
  const [color, setColor] = useState(venue.brandColor ?? "");
  const colorOk = color.trim() === "" || HEX_COLOR.test(color.trim());

  const save = (logoStorageId: string | null | undefined, nextColor: string) =>
    setBrand({
      docId: venue._id,
      version: venue.version,
      logoStorageId: logoStorageId ?? undefined,
      brandColor: nextColor.trim() || undefined,
    });

  const upload = (file: File) =>
    void run("logo", async () => {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok)
        throw new Error(`The logo did not upload (${response.status}).`);
      const { storageId } = (await response.json()) as { storageId: string };
      await save(storageId, venue.brandColor ?? "");
    });

  return (
    <div className="space-y-3" data-testid="venue-brand">
      <h3 className="text-sm font-semibold text-ink">
        Venue logo on proposals
      </h3>
      <p className="text-sm text-ink-3">
        Proposals for events here show your logo first and this logo next to it,
        at the same size.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {logoUrl ? (
          <img
            className="h-12 w-auto max-w-[9rem] rounded-sm border border-line bg-panel object-contain p-1"
            src={logoUrl}
            alt={`${venue.name} logo`}
          />
        ) : (
          <span className="text-sm text-ink-3">No logo yet</span>
        )}
        <label className="btn btn-secondary cursor-pointer">
          {busy === "logo"
            ? "Uploading…"
            : logoUrl
              ? "Change logo"
              : "Upload logo"}
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            disabled={busy != null}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload(file);
            }}
          />
        </label>
        {venue.logoStorageId ? (
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy != null}
            onClick={() =>
              void run("logo", () => save(null, venue.brandColor ?? ""))
            }
          >
            Remove logo
          </button>
        ) : null}
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!colorOk) return;
          void run("color", () => save(venue.logoStorageId, color));
        }}
      >
        <label className="field-label">
          <span>Venue brand colour</span>
          <span className="flex items-center gap-2">
            <input
              className="h-9 w-12 cursor-pointer rounded-sm border border-line"
              type="color"
              aria-label="Pick the venue brand colour"
              value={HEX_COLOR.test(color.trim()) ? color.trim() : "#000000"}
              onChange={(event) => setColor(event.target.value)}
            />
            <input
              className="input w-32"
              name="brandColor"
              value={color}
              placeholder="#1f3a5f"
              onChange={(event) => setColor(event.target.value)}
            />
          </span>
        </label>
        <button
          className="btn btn-secondary"
          type="submit"
          disabled={busy != null || !colorOk}
        >
          {busy === "color" ? "Saving…" : "Save colour"}
        </button>
        {!colorOk ? (
          <p className="w-full text-sm text-danger">
            Write the colour like #1f3a5f, or leave it blank.
          </p>
        ) : null}
      </form>
    </div>
  );
}
