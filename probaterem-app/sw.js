"use strict";
// Csak az alkalmazás saját scope-jához és kiadásához tartozó fájlokat tároljuk.
const PREFIX = "probaterem:" + self.registration.scope + ":";
const CACHE = PREFIX + "1.1.0";
const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./core.js",
  "./db.js",
  "./exports.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable.png",
];
const URLS = FILES.map((f) => new URL(f, self.registration.scope).href);
self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll(URLS.map((url) => new Request(url, { cache: "reload" }))),
      ),
  ),
);
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(PREFIX) && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (
    e.request.mode === "navigate" &&
    url.href.startsWith(self.registration.scope)
  ) {
    e.respondWith(
      caches
        .open(CACHE)
        .then(
          async (c) =>
            (await c.match(
              new URL("./index.html", self.registration.scope).href,
            )) || fetch(e.request),
        ),
    );
    return;
  }
  if (!URLS.includes(url.href)) return;
  e.respondWith(
    caches
      .open(CACHE)
      .then(async (c) => (await c.match(e.request)) || fetch(e.request)),
  );
});
