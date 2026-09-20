/** Which player this device belongs to, so an entered score can be
 *  attributed without a real login. Per docs/SPEC.md's sign-in model, this
 *  is meant to be a one-time "pick your name" that then sticks -- there is
 *  no server-side auth yet (that is further down the build list), so this
 *  is honestly just a local label, not an identity the server verifies.
 *  Good enough for "anyone in the match can enter, and everyone can see
 *  who did" -- not good enough to gate anything sensitive. */

const KEY = "gc:playerId";

export function getDeviceIdentity(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // private browsing / storage blocked -- degrade to "always ask"
  }
}

export function setDeviceIdentity(playerId: string): void {
  try {
    localStorage.setItem(KEY, playerId);
  } catch {
    // Nothing to do -- the picker will just ask again next time.
  }
}

/** The join code from docs/DECISIONS.md #6, remembered per device once
 *  verified so it isn't retyped before every hole. Stored alongside the
 *  device identity above, and just as much a label as a lock -- the server
 *  is the one that actually checks it (see routes/matches.ts). */
const CODE_KEY = "gc:joinCode";

export function getStoredJoinCode(): string | null {
  try {
    return localStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
}

export function setStoredJoinCode(code: string): void {
  try {
    localStorage.setItem(CODE_KEY, code);
  } catch {
    // Nothing to do -- the gate will just ask again next time.
  }
}
