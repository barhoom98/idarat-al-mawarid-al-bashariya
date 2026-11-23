// Web Push (RFC 8030) with VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291), on WebCrypto only,
// so the same file runs in the Supabase Edge Runtime (Deno) and under Node for tests (tests/functions.test.mjs).
const enc = new TextEncoder();

export const b64u = {
  enc(buf: ArrayBuffer | Uint8Array): string {
    const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec(str: string): Uint8Array {
    let s = String(str).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  },
};
const cat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

export type Vapid = { publicKey: string; privateJwk: JsonWebKey; subject: string };
export type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };

/** A new VAPID key pair: the public key (base64url, uncompressed point) goes to the browser, the private JWK stays on the server. */
export async function newVapidKeys(): Promise<{ publicKey: string; privateJwk: JsonWebKey }> {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey) as JsonWebKey;
  const raw = await crypto.subtle.exportKey("raw", kp.publicKey) as ArrayBuffer;
  return { publicKey: b64u.enc(raw), privateJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d } };
}

/** The Authorization header for one push service: a 12-hour ES256 JWT for the endpoint's origin. */
export async function vapidHeader(endpoint: string, vapid: Vapid, now = Date.now()): Promise<string> {
  const head = b64u.enc(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u.enc(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })));
  const key = await crypto.subtle.importKey("jwk", { ...vapid.privateJwk, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(head + "." + body));
  return "vapid t=" + head + "." + body + "." + b64u.enc(sig) + ", k=" + vapid.publicKey;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** RFC 8291: one aes128gcm record for the browser's p256dh key and auth secret. */
export async function encrypt(payload: Uint8Array, p256dh: string, auth: string): Promise<Uint8Array> {
  const ua = b64u.dec(p256dh), secret = b64u.dec(auth);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(secret, shared, cat(enc.encode("WebPush: info\0"), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

/** Send one notification. status 201 = accepted; 404 or 410 = the subscription is gone and should be deleted. */
export async function sendPush(sub: Subscription, data: unknown, vapid: Vapid, ttl = 86400): Promise<{ status: number; text: string }> {
  const body = await encrypt(enc.encode(JSON.stringify(data)), sub.keys.p256dh, sub.keys.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: { Authorization: await vapidHeader(sub.endpoint, vapid), TTL: String(ttl), Urgency: "high", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream" },
    body,
  });
  return { status: res.status, text: res.ok ? "" : (await res.text()).slice(0, 300) };
}
