import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "../../../lib/api";
import { useListServiceStyle } from "../../../lib/manifest-convex-react";

/**
 * Match an old-system service style to one of this company's service styles
 * (AC-064). The imported events that named it and have no style yet get it.
 */
export function ServiceStyleMatch({
  linkId,
  disabled,
  onDone,
  onError,
}: Readonly<{
  linkId: string;
  disabled: boolean;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}>) {
  const styles = useListServiceStyle();
  const resolve = useMutation(
    api.importServiceStyle.resolveImportedServiceStyle,
  );
  const [styleId, setStyleId] = useState("");
  const [busy, setBusy] = useState(false);
  const active = (styles ?? []).filter(
    (style) => style.deletedAt == null && style.status === "active",
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={styleId}
        onChange={(e) => setStyleId(e.target.value)}
        disabled={disabled || busy}
        className="px-2 py-1 border border-line-2 rounded-sm text-2xs min-w-40"
        aria-label="Capsule service style"
      >
        <option value="">Pick a service style…</option>
        {active.map((style) => (
          <option key={style._id} value={style._id}>
            {style.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={disabled || busy || !styleId}
        onClick={() => {
          setBusy(true);
          void resolve({
            linkId: linkId as Id<"externalRecordLinks">,
            serviceStyleId: styleId as Id<"serviceStyles">,
          })
            .then(({ applied }) =>
              onDone(
                `Service style matched; ${applied} imported event(s) updated.`,
              ),
            )
            .catch((cause: unknown) =>
              onError(
                cause instanceof Error
                  ? cause.message
                  : "Couldn't match that service style.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        Match
      </button>
    </div>
  );
}
