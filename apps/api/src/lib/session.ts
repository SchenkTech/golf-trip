/**
 * The admin session cookie: a JSON payload plus an HMAC-SHA256 signature,
 * both base64url-encoded and dot-joined -- `<payload>.<signature>`. Web
 * Crypto (crypto.subtle) is built into the Workers runtime, so this needs
 * no JWT library; there's exactly one payload shape and one algorithm,
 * never anything a general-purpose JWT library's flexibility would help
 * with.
 *
 * Deliberately not a real JWT: no header, no alg negotiation, nothing for
 * an attacker to downgrade. A forged or tampered payload just fails the
 * signature check -- the SESSION_SECRET is what makes that unforgeable,
 * not anything about the format.
 */

interface SessionPayload {
  email: string;
  exp: number; // unix seconds
}

function toBase64Url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  const str = atob(b64);
  return Uint8Array.from(str, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const THIRTY_DAYS = 30 * 24 * 60 * 60;

export async function createSession(email: string, secret: string): Promise<string> {
  const payload: SessionPayload = { email, exp: Math.floor(Date.now() / 1000) + THIRTY_DAYS };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toBase64Url(new Uint8Array(sig))}`;
}

/** Returns the email if the token is well-formed, correctly signed, and
 *  not expired -- null for anything else, deliberately without
 *  distinguishing why, since none of those cases get different handling. */
export async function verifySession(token: string, secret: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  try {
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(sigB64),
      new TextEncoder().encode(payloadB64),
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.email;
  } catch {
    return null; // malformed base64/JSON -- treat exactly like a bad signature
  }
}
