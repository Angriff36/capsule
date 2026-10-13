import { Navigate, useLocation, useParams } from "react-router-dom";

/**
 * Redirect for a screen that moved (docs/design/screen-map.md, "Redirect
 * inventory"). `:name` tokens in `to` take the old route's params. Params
 * named in `paramsToQuery` move into the query string. The old query string
 * is kept, and `hash` points at the section that now holds the screen
 * (unless the old link carried its own #part).
 */
export function MovedRoute({
  to,
  hash,
  paramsToQuery,
}: {
  to: string;
  hash?: string;
  paramsToQuery?: Record<string, string>;
}) {
  const params = useParams();
  const location = useLocation();
  const pathname = to.replace(/:(\w+)/g, (_, name: string) =>
    encodeURIComponent(params[name] ?? ""),
  );
  const search = new URLSearchParams(location.search);
  for (const [param, key] of Object.entries(paramsToQuery ?? {})) {
    const value = params[param];
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return (
    <Navigate
      replace
      to={{
        pathname,
        search: query ? `?${query}` : "",
        // A deep link's own #part wins over the section anchor.
        hash: location.hash || (hash ? `#${hash}` : ""),
      }}
    />
  );
}
