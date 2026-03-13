/**
 * AES-256-GCM encryption for sharing session configs.
 * Uses PBKDF2 to derive an encryption key from a user-provided passphrase.
 * All operations use the Web Crypto API (available in all modern browsers).
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoded = new TextEncoder().encode(passphrase);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoded.buffer as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (base64.length % 4)) % 4;
  const binary = atob(base64 + "=".repeat(pad));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Encrypt plaintext with a passphrase.
 * Returns a URL-safe string: base64url(salt) + "." + base64url(iv) + "." + base64url(ciphertext)
 */
export async function encrypt(plaintext: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);

  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    encoded.buffer as ArrayBuffer,
  );

  return [toBase64Url(salt.buffer as ArrayBuffer), toBase64Url(iv.buffer as ArrayBuffer), toBase64Url(ciphertext)].join(".");
}

/**
 * Decrypt a payload produced by encrypt() using the same passphrase.
 * Throws on wrong passphrase or tampered data.
 */
export async function decrypt(payload: string, passphrase: string): Promise<string> {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted payload");

  const salt = fromBase64Url(parts[0]);
  const iv = fromBase64Url(parts[1]);
  const ciphertext = fromBase64Url(parts[2]);
  const key = await deriveKey(passphrase, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer,
  );

  return new TextDecoder().decode(plaintext);
}

/** Check if a hash looks like an encrypted payload (3 dot-separated base64url segments). */
export function isEncryptedPayload(hash: string): boolean {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw);
}

/** Check if a hash looks like a legacy base64 payload (no dots). */
export function isLegacyPayload(hash: string): boolean {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw || raw.includes(".")) return false;
  try {
    atob(raw);
    return true;
  } catch {
    return false;
  }
}
