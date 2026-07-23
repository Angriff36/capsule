import { useQuery } from "convex/react";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { api } from "../../lib/api";
import {
  useCreateOrganization,
  useOrganizationConfigureBranding,
} from "../../lib/manifest-convex-react";
import { ErrorState, PageHeader, Section } from "../../ui/primitives";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { AdminWorkspaceNav } from "./AdminWorkspaceNav";
import { isValidBrandColor, useTenantBranding } from "./tenantBranding";

const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO_BYTES = 10 * 1024 * 1024;

const canManageBranding = (role: string | undefined) =>
  role === "manager" ||
  role === "admin" ||
  role === "owner" ||
  role === "system" ||
  Boolean(role?.endsWith("_manager"));

export function BrandingPage() {
  const authStatus = useQuery(api.authStatus.getAuthStatus, {});
  const { branding, record, clerkOrganization, loading } = useTenantBranding();
  const configureBranding = useOrganizationConfigureBranding();
  const createOrganization = useCreateOrganization();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | undefined>();
  const [previewBrand, setPreviewBrand] = useState(branding);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canEdit = canManageBranding(authStatus?.role);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  useEffect(() => {
    setPreviewBrand(branding);
  }, [
    branding.displayName,
    branding.address,
    branding.primaryColor,
    branding.accentColor,
    branding.logoUrl,
  ]);

  if (authStatus === undefined || loading) {
    return (
      <QueryLoadState
        loadingTooLong={false}
        title="Loading brand studio"
        detail="Reading this organization's document identity."
      />
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || busy) return;
    const data = new FormData(event.currentTarget);
    const displayName = String(data.get("displayName") ?? "").trim();
    const address = String(data.get("address") ?? "").trim();
    const primaryColor = String(data.get("primaryColor") ?? "").trim();
    const accentColor = String(data.get("accentColor") ?? "").trim();

    if (!displayName || !address) {
      setError("Display name and business address are required.");
      return;
    }
    if (!isValidBrandColor(primaryColor) || !isValidBrandColor(accentColor)) {
      setError("Brand colors must use six-digit hex values such as #233E35.");
      return;
    }
    if (logoFile && !LOGO_TYPES.has(logoFile.type)) {
      setError("Use a PNG, JPEG, or WebP logo so every PDF can render it.");
      return;
    }
    if (logoFile && logoFile.size > MAX_LOGO_BYTES) {
      setError("The logo must be 10 MB or smaller.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (record) {
        await configureBranding({
          docId: record._id,
          version: record.version,
          displayName,
          address,
          primaryColor,
          accentColor,
        });
      } else {
        await createOrganization({
          name: clerkOrganization?.name || displayName,
          brandDisplayName: displayName,
          brandAddress: address,
          brandPrimaryColor: primaryColor,
          brandAccentColor: accentColor,
        });
      }
      if (logoFile) await clerkOrganization?.setLogo({ file: logoFile });
      setLogoFile(null);
      setNotice("Branding saved. New PDFs will use it automatically.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save branding.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeLogo() {
    if (!canEdit || !clerkOrganization || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await clerkOrganization.setLogo({ file: null });
      setLogoFile(null);
      setNotice("Logo removed. PDFs will use the display name instead.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not remove logo.",
      );
    } finally {
      setBusy(false);
    }
  }

  const previewLogo = logoPreview ?? branding.logoUrl;

  return (
    <div className="operations-stage space-y-6">
      <PageHeader
        title="Brand studio"
        lead="Set the identity printed on every proposal, invoice, contract, banquet event order, and menu."
      />
      <AdminWorkspaceNav />
      {!canEdit ? (
        <div className="card border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-warn">
          Only an organization manager can change document branding.
        </div>
      ) : null}
      {error ? (
        <ErrorState title="Branding was not saved" detail={error} />
      ) : null}
      {notice ? (
        <p
          className="card border-ok/30 bg-ok-soft px-4 py-3 text-[13px] text-ok"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <Section title="Document identity">
          <form
            key={`${record?._id ?? "new"}:${record?.version ?? 0}`}
            className="supply-form border-0 shadow-none"
            onSubmit={save}
          >
            <label>
              Display name
              <input
                name="displayName"
                required
                disabled={!canEdit || busy}
                defaultValue={branding.displayName}
                placeholder="Juniper & Co. Catering"
                onInput={(event) =>
                  setPreviewBrand((current) => ({
                    ...current,
                    displayName:
                      event.currentTarget.value || branding.displayName,
                  }))
                }
              />
            </label>
            <label>
              Business address
              <textarea
                name="address"
                rows={3}
                required
                disabled={!canEdit || busy}
                defaultValue={branding.address}
                placeholder={"418 Market Street\nPortland, OR 97205"}
                onInput={(event) =>
                  setPreviewBrand((current) => ({
                    ...current,
                    address: event.currentTarget.value,
                  }))
                }
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                Primary color
                <span className="mt-1 flex items-center gap-2">
                  <input
                    aria-label="Primary color picker"
                    name="primaryColorPicker"
                    type="color"
                    defaultValue={branding.primaryColor}
                    disabled={!canEdit || busy}
                    onInput={(event) => {
                      const form = event.currentTarget.form;
                      const text = form?.elements.namedItem("primaryColor");
                      if (text instanceof HTMLInputElement) {
                        text.value = event.currentTarget.value.toUpperCase();
                        setPreviewBrand((current) => ({
                          ...current,
                          primaryColor: text.value,
                        }));
                      }
                    }}
                    className="h-11 w-14 cursor-pointer p-1"
                  />
                  <input
                    name="primaryColor"
                    required
                    pattern="#[0-9A-Fa-f]{6}"
                    defaultValue={branding.primaryColor}
                    disabled={!canEdit || busy}
                    className="font-mono uppercase"
                    onInput={(event) => {
                      if (isValidBrandColor(event.currentTarget.value)) {
                        setPreviewBrand((current) => ({
                          ...current,
                          primaryColor: event.currentTarget.value,
                        }));
                      }
                    }}
                  />
                </span>
              </label>
              <label>
                Accent color
                <span className="mt-1 flex items-center gap-2">
                  <input
                    aria-label="Accent color picker"
                    name="accentColorPicker"
                    type="color"
                    defaultValue={branding.accentColor}
                    disabled={!canEdit || busy}
                    onInput={(event) => {
                      const form = event.currentTarget.form;
                      const text = form?.elements.namedItem("accentColor");
                      if (text instanceof HTMLInputElement) {
                        text.value = event.currentTarget.value.toUpperCase();
                        setPreviewBrand((current) => ({
                          ...current,
                          accentColor: text.value,
                        }));
                      }
                    }}
                    className="h-11 w-14 cursor-pointer p-1"
                  />
                  <input
                    name="accentColor"
                    required
                    pattern="#[0-9A-Fa-f]{6}"
                    defaultValue={branding.accentColor}
                    disabled={!canEdit || busy}
                    className="font-mono uppercase"
                    onInput={(event) => {
                      if (isValidBrandColor(event.currentTarget.value)) {
                        setPreviewBrand((current) => ({
                          ...current,
                          accentColor: event.currentTarget.value,
                        }));
                      }
                    }}
                  />
                </span>
              </label>
            </div>
            <label>
              Organization logo
              <input
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={!canEdit || busy}
                onChange={(event) =>
                  setLogoFile(event.target.files?.[0] ?? null)
                }
              />
              <span className="mt-1 block text-[11px] font-normal text-ink-3">
                PNG, JPEG, or WebP · up to 10 MB · transparent PNG works best.
              </span>
            </label>
            <div className="supply-row-actions">
              <button className="btn btn-primary" disabled={!canEdit || busy}>
                {busy ? "Saving…" : "Save branding"}
              </button>
              {branding.logoUrl ? (
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={!canEdit || busy}
                  onClick={() => void removeLogo()}
                >
                  Remove logo
                </button>
              ) : null}
            </div>
          </form>
        </Section>

        <section aria-label="Document preview" className="min-w-0">
          <p className="eyebrow">Live preview</p>
          <article
            className="mt-3 overflow-hidden rounded-sm border border-line-2 bg-white shadow-[0_28px_70px_-45px_rgba(20,28,25,0.65)]"
            style={
              {
                "--preview-primary": previewBrand.primaryColor,
                "--preview-accent": previewBrand.accentColor,
              } as CSSProperties
            }
          >
            <header className="bg-[var(--preview-primary)] px-7 py-7 text-white">
              <div className="flex min-h-18 items-start justify-between gap-5">
                <div>
                  {previewLogo ? (
                    <img
                      src={previewLogo}
                      alt="Organization logo preview"
                      className="mb-4 max-h-14 max-w-44 object-contain object-left"
                    />
                  ) : null}
                  <h2 className="font-display text-2xl">
                    {previewBrand.displayName}
                  </h2>
                  <p className="mt-2 whitespace-pre-line text-[11px] leading-relaxed text-white/70">
                    {previewBrand.address || "Your business address"}
                  </p>
                </div>
                <span className="font-mono text-[10px] tracking-[0.18em] text-white/70">
                  PROPOSAL
                </span>
              </div>
            </header>
            <div className="px-7 py-8 text-ink">
              <p className="text-[9px] font-semibold tracking-[0.16em] text-[var(--preview-accent)] uppercase">
                Prepared for
              </p>
              <h3 className="mt-2 font-display text-2xl">
                Hawthorne Summer Dinner
              </h3>
              <div className="mt-7 grid grid-cols-2 gap-6 border-y border-line py-5 text-[11px]">
                <div>
                  <span className="text-ink-3">Event date</span>
                  <strong className="mt-1 block">August 24, 2026</strong>
                </div>
                <div>
                  <span className="text-ink-3">Guests</span>
                  <strong className="mt-1 block">120</strong>
                </div>
              </div>
              <div className="mt-7 flex items-end justify-between gap-5">
                <p className="max-w-72 text-[11px] leading-relaxed text-ink-2">
                  The same identity is applied automatically across every
                  customer-facing PDF.
                </p>
                <span className="h-1 w-24 bg-[var(--preview-accent)]" />
              </div>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
