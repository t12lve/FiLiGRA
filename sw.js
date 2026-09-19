/**
 * FiLiGRA Service Worker — shell cache + Cross-Origin Isolation headers
 */
const CACHE_NAME = "filigra-shell-v4";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./pwa-boot.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./apple-touch-icon.png",
  "./icon.svg",
  "./filigra_logo.png",
];

let coepCredentialless = false;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn("[FiLiGRA-SW] Cache install partial:", err);
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (ev) => {
  if (!ev.data) return;
  if (ev.data.type === "deregister") {
    self.registration.unregister().then(() => {
      return self.clients.matchAll();
    }).then((clients) => {
      clients.forEach((client) => client.navigate(client.url));
    });
  } else if (ev.data.type === "coepCredentialless") {
    coepCredentialless = ev.data.value;
  }
});

function withCoiHeaders(response) {
  if (response.status === 0) return response;
  const newHeaders = new Headers(response.headers);
  newHeaders.set(
    "Cross-Origin-Embedder-Policy",
    coepCredentialless ? "credentialless" : "require-corp"
  );
  if (!coepCredentialless) {
    newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
  }
  newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

self.addEventListener("fetch", (event) => {
  const r = event.request;
  if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
    return;
  }

  const request =
    coepCredentialless && r.mode === "no-cors"
      ? new Request(r, { credentials: "omit" })
      : r;

  const url = new URL(r.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isShellGet = r.method === "GET" && isSameOrigin;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const stamped = withCoiHeaders(response.clone());
        if (isShellGet && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(r, copy)).catch(() => {});
        }
        return stamped;
      })
      .catch(async () => {
        if (!isShellGet) return undefined;
        const cached = await caches.match(r);
        if (cached) return withCoiHeaders(cached);
        if (r.mode === "navigate") {
          const fallback = await caches.match("./index.html");
          if (fallback) return withCoiHeaders(fallback);
        }
        return undefined;
      })
  );
});
