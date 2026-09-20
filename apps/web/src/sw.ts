/// <reference lib="webworker" />
declare let self: ServiceWorkerGlobalScope;

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

/** The app shell -- everything Vite built, hashed filenames included --
 *  goes in the precache so the Board can open with zero signal, per
 *  docs/DECISIONS.md #7. self.__WB_MANIFEST is replaced at build time by
 *  vite-plugin-pwa's injectManifest with the real file list. */
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

/** Live data always wins when there's signal -- this is a scoreboard, not
 *  a snapshot. NetworkFirst falls back to the last successful response
 *  only when the network genuinely fails, which is exactly the "opened
 *  the app on the back nine with no bars" case this exists for. Score
 *  *writes* are handled entirely by src/lib/offlineQueue.ts, not this
 *  worker -- this only covers GETs, so a queued write never gets treated
 *  as cacheable. */
registerRoute(
  ({ url, request }) => request.method === "GET" && url.pathname.startsWith("/api/"),
  new NetworkFirst({ cacheName: "api-cache", networkTimeoutSeconds: 4 }),
);

self.skipWaiting();
self.addEventListener("activate", () => self.clients.claim());
