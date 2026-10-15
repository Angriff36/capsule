import { useEffect, useState } from "react";
import { cn } from "../lib/utils";
import "./code-block.css";
import { CopyButton } from "./code-copy-button";

/** Highlights with Shiki's web bundle, loaded on demand. Falls back to escaped text. */
export async function highlight(code: string, lang: string): Promise<string> {
  const { codeToHtml } = await import("shiki/bundle/web");
  try {
    return await codeToHtml(code, {
      lang,
      themes: { light: "github-light", dark: "slack-dark" },
    });
  } catch {
    const escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<pre class="shiki"><code>${escaped}</code></pre>`;
  }
}

export function CodeBlock({
  code,
  lang = "tsx",
  className,
}: {
  code: string;
  lang?: string;
  className?: string;
}) {
  const [html, setHtml] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    highlight(code, lang).then((highlighted) => {
      if (!cancelled) {
        setHtml(highlighted);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  if (isLoading) {
    return (
      <div className={cn("relative", className)}>
        <div className="p-6 w-full mx-auto h-[400px] dark:bg-neutral-800 bg-neutral-200 animate-pulse rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className={cn("uil-code relative", className)}>
      <CopyButton
        code={code}
        classname="right-2 top-2 bg-white dark:bg-neutral-800"
      />

      <div
        className="not-prose max-h-[550px] overflow-x-hidden rounded-md text-sm border dark:border-neutral-800"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

/** Pre-highlighted code with a copy button (ui-layouts' ClientPreCode). */
export function ClientPreCode({
  html,
  raw,
  className,
}: {
  html: string;
  raw: string;
  className?: string;
}) {
  return (
    <div className={cn("uil-code relative", className)}>
      <CopyButton
        code={raw}
        classname="right-2 top-2 bg-white dark:bg-neutral-800"
      />

      <div
        className="not-prose max-h-[550px] overflow-x-hidden rounded-md text-sm border dark:border-neutral-800"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
