const CACHE_NAME = "assignment-app-v10";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];
const HTML_FALLBACK = new URL("./index.html", self.location.href).toString();

self.addEventListener("install", event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        APP_SHELL.map(url => cache.add(new Request(new URL(url, self.location.href), { cache: "reload" })))
      ))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      ))
      .then(() => clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (isHtmlRequest(event.request)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});

function isHtmlRequest(request) {
  return request.mode === "navigate"
    || request.destination === "document"
    || request.headers.get("accept")?.includes("text/html");
}

function fetchFresh(request) {
  return fetch(new Request(request.url, {
    cache: "reload",
    credentials: "same-origin",
    headers: request.headers
  }));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetchFresh(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      if (new URL(request.url).pathname.endsWith("/")) {
        await cache.put(HTML_FALLBACK, response.clone());
      }
    }
    return response;
  } catch {
    return await cache.match(request)
      || await cache.match(HTML_FALLBACK)
      || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const networkResponsePromise = fetchFresh(request)
    .then(response => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cachedResponse || await networkResponsePromise || Response.error();
}
