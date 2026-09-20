/** Whether this page is already running as the installed app, not a
 *  browser tab -- iOS exposes this as navigator.standalone (non-standard,
 *  hence the cast), everyone else via the display-mode media query. Used
 *  to hide the install button once there's nothing left to install. */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** The event Chrome/Edge/Android fire when they've decided the page is
 *  installable, captured so InstallButton.tsx can trigger it later from a
 *  real click -- browsers refuse to show the native prompt except in
 *  direct response to user input, so this has to be stashed rather than
 *  called immediately. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
