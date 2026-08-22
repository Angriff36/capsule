/*
 * Capsule app-shell service worker.
 *
 * Caches ONLY same-origin GET responses for the static shell: the HTML entry,
 * the web manifest, icons, and the hashed /assets/ bundles. It never touches
 * Convex, Clerk, or any other origin, never caches non-GET requests, and never
 * stores credentials — so the cached shell can boot offline and show the
 * explicit "offline" state (see src/app/shell/OfflineShell.tsx) without
 * bypassing AuthGate or exposing protected data.
 *
 * Strategy: HTML navigations and the SHELL files are network-first (a deploy
 * shows up on the next online load); hashed /assets/* are immutable, so they
 * are cache-first. Only text/html is ever stored under "/", so a direct hit on
 * an icon or the manifest can never replace the offline shell.
 */
const VERSION = "capsule-shell-v2";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon.png",
];
/** Keep the asset cache bounded across deploys (hashed chunks accumulate). */
const MAX_ASSET_ENTRIES = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Atomic: the shell, its entry bundles (parsed from index.html), and the
      // icons all land together or the install fails and the previous worker
      // keeps serving. A half-cached shell would boot to a blank page offline.
      const html = await (await fetch("/", { cache: "no-store" })).text();
      const assets = [
        ...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g),
      ].map((match) => match[1]);
      const cache = await caches.open(VERSION);
      await cache.addAll([...new Set([...SHELL, ...assets])]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isHtml(response) {
  return (response.headers.get("content-type") || "").includes("text/html");
}

/**
 * After a deploy the HTML references new entry bundles. Cache those first and
 * only then replace "/" — so an interrupted refresh never leaves an offline
 * shell whose scripts are missing (the previous shell keeps working).
 */
async function promoteShell(response) {
  const html = await response.text();
  const assets = [
    ...new Set(
      [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  const cache = await caches.open(VERSION);
  const missing = [];
  for (const asset of assets) {
    if (!(await cache.match(asset))) missing.push(asset);
  }
  if (missing.length > 0) await cache.addAll(missing);
  await cache.put("/", new Response(html, { headers: response.headers }));
}

async function pruneAssets(cache) {
  const assets = (await cache.keys()).filter((request) =>
    new URL(request.url).pathname.startsWith("/assets/"),
  );
  const excess = assets.length - MAX_ASSET_ENTRIES;
  for (let i = 0; i < excess; i++) await cache.delete(assets[i]);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Convex, Clerk, fonts: never cached

  // SPA navigations: network first; the cached index.html when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok && isHtml(response)) {
            event.waitUntil(promoteShell(response.clone()));
          }
          return response;
        } catch {
          const cached = await caches.match("/");
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Manifest and icons: network first so a new deploy is picked up.
  if (SHELL.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(VERSION).then((cache) => cache.put(request, copy)),
            );
          }
          return response;
        } catch {
          const cached = await caches.match(request);
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed bundles are immutable: cache first, fill on miss, keep bounded.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(VERSION).then(async (cache) => {
              await cache.put(request, copy);
              await pruneAssets(cache);
            }),
          );
        }
        return response;
      })(),
    );
  }
});
