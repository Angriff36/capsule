// PL-INBOX (AC-112): staff can open a failed or stored provider delivery to
// see what went wrong, but never the provider's keys. Values under key names
// that carry access (tokens, secrets, passwords, signatures, api keys,
// cookies) are replaced before the raw text is stored. A JSON object kept as
// a string inside the payload (a pasted or polled envelope) is hidden the
// same way, so the stored text still re-reads for a retry.

const SECRET_KEY = /token|secret|password|signature|authorization|api[_-]?key|cookie/i;
export const HIDDEN_VALUE = "[hidden]";

function redactJsonText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return text;
  try {
    return JSON.stringify(redactSecrets(JSON.parse(trimmed)));
  } catch {
    return text;
  }
}

/** A copy of `value` with every secret-named field hidden, at any depth. */
export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") return redactJsonText(value);
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? HIDDEN_VALUE : redactSecrets(inner);
    }
    return out;
  }
  return value;
}
