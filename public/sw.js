/*
 * Capsule app-shell service worker.
 *
 * Caches ONLY same-origin GET responses for the static shell: the HTML entry,
 * the web manifest, icons, and the hashed /assets/ bundles. It never touches
 * Convex, Clerk, or any other origin, never caches non-GET requests, and never
 * stores credentials — so the cached shell can boot offline and show the
 * explicit "offline" state (see src/app/shell/OfflineShell.tsx) without
 * bypassing AuthGate or exposing protected data.
 */
const VERSION = "capsule-shell-v1";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(SHELL);
      // Precache the entry bundles index.html references so the shell renders
      // with no network at all. Route chunks are cached on first use below.
      try {
        const html = await (await fetch("/", { cache: "no-store" })).text();
        const assets = [
          ...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g),
        ].map((match) => match[1]);
        await cache.addAll([...new Set(assets)]);
      } catch {
        // Offline during install: the shell list above still applies.
      }
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

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Convex, Clerk, fonts: never cached

  // SPA navigations: network first, cached index.html when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(VERSION);
            void cache.put("/", response.clone());
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

  // Hashed bundles and shell files: cache first, fill on miss.
  if (url.pathname.startsWith("/assets/") || SHELL.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(VERSION);
          void cache.put(request, response.clone());
        }
        return response;
      })(),
    );
  }
});
