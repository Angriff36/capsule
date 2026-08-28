import { useAction } from "convex/react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { ErrorState, PageHeader, Section } from "../../ui/primitives";
import { AdminWorkspaceNav } from "./AdminWorkspaceNav";

type KeyRow = {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
  revoked: boolean;
  expired: boolean;
};

const when = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString() : "never";

/**
 * Personal API keys for remote agents. A key acts as the user who created it
 * (same tenant, same role) on the command API until it is revoked here.
 * Keys live in Clerk; convex/apiKeys.ts talks to it for the signed-in user.
 */
export function ApiKeysPage() {
  const listMine = useAction(api.apiKeys.listMine);
  const createMine = useAction(api.apiKeys.createMine);
  const revokeMine = useAction(api.apiKeys.revokeMine);
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ name: string; secret: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const base = `${window.location.origin}/api/manifest`;

  const load = useCallback(() => {
    listMine({})
      .then((rows) => setKeys(rows))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setKeys([]);
      });
  }, [listMine]);

  useEffect(() => {
    load();
  }, [load]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const result = await createMine({ name });
      setFresh({ name: result.key.name, secret: result.secret });
      setName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await revokeMine({ apiKeyId: id });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const live = (keys ?? []).filter((k) => !k.revoked && !k.expired);

  return (
    <div className="page">
      <PageHeader
        title="API keys"
        lead="Give a remote agent one key. It then uses the command API as you — same tenant, same permissions — until you revoke the key here."
      />
      <AdminWorkspaceNav />
      {error ? <ErrorState title="API keys" detail={error} /> : null}

      {fresh ? (
        <Section title={`New key: ${fresh.name}`}>
          <p className="text-ink-2">
            Copy it now. This is the only time the key is shown.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all">{fresh.secret}</code>
            <button type="button" className="btn" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setFresh(null)}
            >
              Done
            </button>
          </div>
        </Section>
      ) : null}

      <Section title="Create a key">
        <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-ink-2">Name (who will use it)</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Estabon"
              required
            />
          </label>
          <button type="submit" className="btn" disabled={busy}>
            Create key
          </button>
        </form>
      </Section>

      <Section title="Your keys" count={live.length}>
        {keys === null ? (
          <p className="text-ink-2">Loading…</p>
        ) : live.length === 0 ? (
          <p className="text-ink-2">No active keys.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <th className="th">Name</th>
                <th className="th">Created</th>
                <th className="th">Last used</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {live.map((k) => (
                <tr key={k.id}>
                  <td className="td">{k.name}</td>
                  <td className="td">{when(k.createdAt)}</td>
                  <td className="td">{when(k.lastUsedAt)}</td>
                  <td className="td text-right">
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => onRevoke(k.id)}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="How an agent uses a key">
        <p className="text-ink-2">
          Send <code>Authorization: Bearer &lt;key&gt;</code> to{" "}
          <code>{base}/commands</code> to list commands, then{" "}
          <code>
            POST {base}/{"{Entity}"}/commands/{"{command}"}
          </code>{" "}
          to run one.
        </p>
      </Section>
    </div>
  );
}
