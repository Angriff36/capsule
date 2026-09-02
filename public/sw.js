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
      const shell = await fetch("/", { cache: "no-store" });
      if (!shell.ok || !isHtml(shell)) throw new Error("shell unavailable");
      const html = await shell.clone().text();
      const assets = [
        ...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g),
      ].map((match) => match[1]);
      const cache = await caches.open(VERSION);
      await stageAssets(cache, [
        ...new Set([...SHELL.filter((path) => path !== "/"), ...assets]),
      ]);
      // The exact HTML whose bundles were just staged — never a second fetch
      // that could land on a newer deployment.
      await cache.put("/", shell);
      await self.skipWaiting();
    })().catch((error) => {
      // A failed install leaves no worker (and so no offline shell and no
      // push); say why in the worker console instead of failing silently.
      console.error("capsule: app-shell install failed", error);
      throw error;
    }),
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
  if (missing.length > 0) await stageAssets(cache, missing);
  await cache.put("/", new Response(html, { headers: response.headers }));
  await pruneAssets(cache);
}

/**
 * Fetch each static file once and keep it only if it is a real 200 of the
 * expected kind. During a deploy switch the SPA rewrite answers a vanished
 * /assets/ URL with index.html (200, text/html) — caching that under a JS URL
 * would boot a blank shell offline, so it fails the stage instead.
 */
async function stageAssets(cache, urls) {
  const staged = [];
  for (const url of urls) {
    const response = await fetch(url, { cache: "no-store" });
    const html = isHtml(response);
    const wantsHtml = url === "/";
    if (!response.ok || html !== wantsHtml) {
      throw new Error(`shell asset unavailable: ${url}`);
    }
    staged.push([url, response]);
  }
  for (const [url, response] of staged) await cache.put(url, response);
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
        // Never cache the SPA rewrite's HTML under a bundle URL (deploy switch).
        if (response.ok && !isHtml(response)) {
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

/*
 * Web push for team chat. The payload is built by convex/teamChatPush.ts:
 * { title, body, url, tag }. Every push shows a notification (a silent push
 * would cost the site its permission on Safari); a click focuses an open
 * Capsule window and moves it to the thread, or opens one.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Capsule", body: event.data ? event.data.text() : "" };
  }
  const url = typeof data.url === "string" ? data.url : "/staff/messages";
  event.waitUntil(
    self.registration.showNotification(data.title || "Capsule", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "capsule-chat",
      renotify: true,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) ||
      "/staff/messages",
    self.location.origin,
  ).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ("navigate" in client) {
          try {
            await client.navigate(target);
            return;
          } catch {
            // Fall through: the page moves itself.
          }
        }
        client.postMessage({ type: "capsule:navigate", url: target });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// The push service rotated the subscription: subscribe again with the same
// server key and let an open page re-register the new endpoint (the worker
// itself has no sign-in to talk to Convex with).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const key = old && old.options ? old.options.applicationServerKey : null;
      if (!key) return;
      await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const windows = await self.clients.matchAll({ type: "window" });
      for (const client of windows) {
        client.postMessage({ type: "capsule:push-changed" });
      }
    })(),
  );
});
