import { useEffect, useState, type FormEvent } from "react";
import {
  useAssistantLlmConfigConfigure,
  useCreateAssistantLlmConfig,
  useListAssistantLlmConfig,
} from "../../lib/manifest-convex-react";
import { ErrorState, PageHeader, Section } from "../../ui/primitives";
import { AdminWorkspaceNav } from "./AdminWorkspaceNav";

/**
 * Tenant configuration for the in-app AI assistant (docs/systems/assistant.md).
 * Saved through the governed generated commands — manage/admin roles only.
 * The API key is a private field: it is stored write-only from the UI's point
 * of view (it can never be read back) and only the server-side assistant
 * action ever sees it.
 */
export function AssistantSettingsPage() {
  const configs = useListAssistantLlmConfig();
  const createConfig = useCreateAssistantLlmConfig();
  const configureConfig = useAssistantLlmConfigConfigure();
  const existing = configs?.find((c) => c.deletedAt == null);

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (existing) {
      setBaseUrl((v) => v || existing.baseUrl);
      setModel((v) => v || existing.model);
    }
  }, [existing]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      if (existing) {
        await configureConfig({
          docId: existing.docId,
          baseUrl,
          apiKey,
          model,
        });
      } else {
        await createConfig({ baseUrl, apiKey, model });
      }
      setApiKey("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <AdminWorkspaceNav />
      <PageHeader
        title="Assistant"
        lead="Configure the in-app AI assistant. It can look things up and make changes for your staff — as the signed-in user."
      />
      <Section title="Model endpoint">
        {configs === undefined ? null : (
          <form onSubmit={onSubmit} className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Base URL</span>
              <input
                type="url"
                required
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="rounded-sm border border-line bg-canvas px-2.5 py-1.5 text-sm focus:border-brand/50 focus:outline-none"
              />
              <span className="text-xs text-ink-3">
                OpenAI-compatible chat completions root.
              </span>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">API key</span>
              <input
                type="password"
                required
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={existing ? "Enter key to update" : "sk-…"}
                className="rounded-sm border border-line bg-canvas px-2.5 py-1.5 text-sm focus:border-brand/50 focus:outline-none"
              />
              <span className="text-xs text-ink-3">
                {existing
                  ? "Stored write-only — it cannot be read back; re-enter it to change."
                  : "Stored server-side. It is never sent to the browser."}
              </span>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Model</span>
              <input
                type="text"
                required
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini"
                className="rounded-sm border border-line bg-canvas px-2.5 py-1.5 text-sm focus:border-brand/50 focus:outline-none"
              />
              <span className="text-xs text-ink-3">
                Must support function calling.
              </span>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={busy}
                className="cursor-pointer rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
              >
                {busy ? "Saving…" : existing ? "Update" : "Save"}
              </button>
              {saved && (
                <span className="text-sm text-ink-2">
                  Saved — the assistant uses it on the next message.
                </span>
              )}
              {existing?.configuredAt != null && (
                <span className="text-xs text-ink-3">
                  Last configured{" "}
                  {new Date(existing.configuredAt).toLocaleString()}
                </span>
              )}
            </div>
          </form>
        )}
        {error != null && (
          <div className="mt-3">
            <ErrorState title="Could not save" detail={error} />
          </div>
        )}
      </Section>
    </div>
  );
}
