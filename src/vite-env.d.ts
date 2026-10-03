/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL?: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

/** Commit this build came from (vite.config.ts define); null outside Vercel. */
declare const __CAPSULE_BUILD__: string | null;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
