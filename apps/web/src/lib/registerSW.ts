import { registerSW } from "virtual:pwa-register";

/** Called once from main.tsx. autoUpdate means a new deploy's service
 *  worker takes over silently on the next load -- no "reload to update"
 *  prompt to build for a 12-person app that gets used a few days a year. */
export function initServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  registerSW({ immediate: true });
}
