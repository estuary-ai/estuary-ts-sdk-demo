"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { decryptPayload, detectPayloadType, type PayloadType } from "@/lib/crypto";

const IS_DEV = process.env.NODE_ENV === "development";
const DEFAULT_SERVER_URL = IS_DEV ? "http://localhost:4001" : "https://api.estuary-ai.com";

interface ConnectConfig {
  serverUrl: string;
  apiKey?: string;
  sessionToken?: string;
  characterId: string;
  playerId: string;
}

/** Share tokens from share.estuary-ai.com are exchanged on Estuary Cloud, not a local dev server. */
const SHARE_EXCHANGE_BASE =
  process.env.NEXT_PUBLIC_SHARE_EXCHANGE_URL?.replace(/\/$/, "") ||
  "https://api.estuary-ai.com";

const RECIPIENT_COOKIE = "est_recipient_id";
const RECIPIENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** Read or create a persistent per-recipient UUID so isolated shares have stable memory. */
function getOrCreateRecipientId(): string {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${RECIPIENT_COOKIE}=([^;]+)`)
  );
  if (match) return decodeURIComponent(match[1]);
  const id = crypto.randomUUID();
  document.cookie =
    `${RECIPIENT_COOKIE}=${encodeURIComponent(id)}` +
    `; max-age=${RECIPIENT_COOKIE_MAX_AGE}` +
    `; path=/` +
    `; SameSite=Lax`;
  return id;
}

async function exchangeShareToken(token: string): Promise<ConnectConfig> {
  const recipientId = getOrCreateRecipientId();
  const res = await fetch(`${SHARE_EXCHANGE_BASE}/api/v1/share/${token}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipientId }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || "Share link expired or invalid");
  }
  const data = await res.json();
  return {
    serverUrl: data.serverUrl || DEFAULT_SERVER_URL,
    sessionToken: data.sessionToken,
    characterId: data.characterId,
    playerId: data.playerId,
  };
}

function decodeLegacyConfig(hash: string): ConnectConfig | null {
  try {
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!raw) return null;
    const parsed = JSON.parse(atob(raw));
    if (parsed.serverUrl && (parsed.apiKey || parsed.sessionToken) && parsed.characterId && parsed.playerId) {
      return parsed as ConnectConfig;
    }
    return null;
  } catch {
    return null;
  }
}

async function decryptConfig(hash: string, passphrase?: string): Promise<ConnectConfig> {
  const plaintext = await decryptPayload(hash, passphrase);
  const parsed = JSON.parse(plaintext);
  if (!parsed.serverUrl || (!parsed.apiKey && !parsed.sessionToken) || !parsed.characterId || !parsed.playerId) {
    throw new Error("Invalid config");
  }
  return parsed as ConnectConfig;
}

export default function ConnectPage() {
  const router = useRouter();
  const [config, setConfig] = useState<ConnectConfig>({
    serverUrl: DEFAULT_SERVER_URL,
    apiKey: "",
    characterId: "",
    playerId: `demo-user-${Math.random().toString(36).slice(2, 8)}`,
  });
  const [isFromLink, setIsFromLink] = useState(false);
  const [hashInput, setHashInput] = useState("");
  const [hashError, setHashError] = useState<string | null>(null);

  // Encrypted link state
  const [encryptedHash, setEncryptedHash] = useState<string | null>(null);
  const [hashPayloadType, setHashPayloadType] = useState<PayloadType>("unknown");
  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isExchangingShare, setIsExchangingShare] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Restore saved config or detect shared link type
  useEffect(() => {
    // Check for share token FIRST (takes priority over hash links)
    const params = new URLSearchParams(window.location.search);
    const shareToken = params.get("share");

    if (shareToken) {
      setIsFromLink(true);
      setIsExchangingShare(true);
      exchangeShareToken(shareToken)
        .then((creds) => {
          sessionStorage.setItem("estuary-config", JSON.stringify(creds));
          router.push("/chat");
        })
        .catch((err) => {
          setIsFromLink(false);
          setIsExchangingShare(false);
          setHashError(
            err.message.includes("429")
              ? "Too many requests. Please try again in a minute."
              : "Share link expired or invalid."
          );
        });
      return; // Skip hash detection
    }

    const hash = window.location.hash;
    const type = detectPayloadType(hash);

    if (type === "passphrase") {
      // v1: needs passphrase
      setEncryptedHash(hash);
      setHashPayloadType(type);
      return;
    }
    if (type === "legacy") {
      const shared = decodeLegacyConfig(hash);
      if (shared) {
        setConfig(shared);
        setIsFromLink(true);
        return;
      }
    }
    const saved = sessionStorage.getItem("estuary-config");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConfig((prev) => ({ ...prev, ...parsed }));
      } catch { /* ignore */ }
    }
  }, []);

  // Auto-connect from shared link (legacy or after decryption)
  useEffect(() => {
    if (isFromLink && (config.apiKey || config.sessionToken)) {
      sessionStorage.setItem("estuary-config", JSON.stringify(config));
      router.push("/chat");
    }
  }, [isFromLink, config, router]);

  const handleDecryptLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!encryptedHash || !passphrase.trim()) return;
    setIsDecrypting(true);
    setPassphraseError(null);
    try {
      const decrypted = await decryptConfig(encryptedHash, passphrase.trim());
      setConfig(decrypted);
      setEncryptedHash(null);
      setIsFromLink(true);
    } catch {
      setPassphraseError("Wrong passphrase or corrupted link. Please try again.");
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleConnect = (e: FormEvent) => {
    e.preventDefault();
    sessionStorage.setItem("estuary-config", JSON.stringify(config));
    router.push("/chat");
  };

  // Show full-page loading for share links — user goes straight to chat
  if (isExchangingShare) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded bg-accent flex items-center justify-center animate-pulse">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="23" />
              <line x1="8" x2="16" y1="23" y2="23" />
            </svg>
          </div>
          <p className="text-sm text-muted animate-pulse">Connecting to character...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/estuary-logo.png" alt="Estuary" className="w-16 h-16 rounded mb-4 mx-auto" />
            <h1 className="text-2xl font-bold tracking-tight">
              {encryptedHash && hashPayloadType === "passphrase"
                ? "Encrypted Session Link"
                : "Estuary"}
            </h1>
            <p className="text-sm text-muted mt-1">
              {encryptedHash && hashPayloadType === "passphrase"
                ? "Enter the passphrase to unlock this shared session"
                : isFromLink
                  ? "Joining shared session..."
                  : "Connect to a character to start chatting"}
            </p>
          </div>

          {/* Passphrase prompt for v1 encrypted links */}
          {encryptedHash && hashPayloadType === "passphrase" && (
            <form onSubmit={handleDecryptLink} className="space-y-4 mb-6">
              <div className="rounded border border-border bg-surface p-5 space-y-4">
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-accent/10 border border-accent/20">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-light shrink-0 mt-0.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <p className="text-[11px] text-accent-light leading-relaxed">
                    This session link is encrypted. Ask the person who shared it for the passphrase.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Passphrase</label>
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => {
                      setPassphrase(e.target.value);
                      setPassphraseError(null);
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-surface-light border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition font-mono"
                    placeholder="Enter passphrase..."
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    autoFocus
                    required
                  />
                  {passphraseError && (
                    <p className="text-xs text-danger mt-1.5">{passphraseError}</p>
                  )}
                </div>
              </div>
              <button
                type="submit"
                disabled={!passphrase.trim() || isDecrypting}
                className="w-full py-2.5 rounded bg-accent text-white font-medium text-sm hover:bg-accent-light transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDecrypting ? "Decrypting..." : "Unlock & Connect"}
              </button>

              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted">or connect manually</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            </form>
          )}

          <form onSubmit={handleConnect} className="space-y-4" autoComplete="off">
            <div className="rounded border border-border bg-surface p-5 space-y-4">
              {IS_DEV && (
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Server URL</label>
                  <input
                    type="text"
                    value={config.serverUrl}
                    onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-surface-light border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition font-mono"
                    placeholder="http://localhost:4001"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">API Key</label>
                <div className="relative">
                  <input
                    type="text"
                    value={config.apiKey}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    className={`w-full px-3 py-2 pr-10 rounded-lg bg-surface-light border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition font-mono ${!showApiKey ? "[-webkit-text-security:disc]" : ""}`}
                    placeholder="est_..."
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-foreground transition"
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showApiKey ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" x2="23" y1="1" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Character ID</label>
                <input
                  type="text"
                  value={config.characterId}
                  onChange={(e) => setConfig({ ...config, characterId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface-light border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition font-mono"
                  placeholder="uuid-of-your-character"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Player ID</label>
                <input
                  type="text"
                  value={config.playerId}
                  onChange={(e) => setConfig({ ...config, playerId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface-light border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition font-mono"
                  placeholder="your-player-id"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded bg-accent text-white font-medium text-sm hover:bg-accent-light transition-all"
            >
              Connect
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted">or join via session hash</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Hash import */}
          <div className="rounded border border-border bg-surface p-5 space-y-3">
            <label className="block text-xs font-medium text-muted">Session Hash</label>
            <p className="text-[11px] text-muted leading-relaxed">
              Paste an encrypted session hash to connect.
            </p>
            <input
              type="text"
              value={hashInput}
              onChange={(e) => {
                setHashInput(e.target.value);
                setHashError(null);
              }}
              className="w-full px-3 py-2 rounded-lg bg-surface-light border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition font-mono"
              placeholder="Paste session hash here..."
            />
            {detectPayloadType(hashInput.trim()) === "passphrase" && (
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Passphrase</label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => {
                    setPassphrase(e.target.value);
                    setHashError(null);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-surface-light border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition font-mono"
                  placeholder="Enter passphrase..."
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </div>
            )}
            {hashError && (
              <p className="text-xs text-danger">{hashError}</p>
            )}
            <button
              type="button"
              disabled={!hashInput.trim() || isDecrypting}
              onClick={async () => {
                const trimmed = hashInput.trim();
                const type = detectPayloadType(trimmed);
                if (type === "passphrase") {
                  if (!passphrase.trim()) {
                    setHashError("Passphrase is required for this hash.");
                    return;
                  }
                  setIsDecrypting(true);
                  setHashError(null);
                  try {
                    const parsed = await decryptConfig(trimmed, passphrase.trim());
                    sessionStorage.setItem("estuary-config", JSON.stringify(parsed));
                    router.push("/chat");
                  } catch {
                    setHashError("Wrong passphrase or invalid hash.");
                  } finally {
                    setIsDecrypting(false);
                  }
                } else if (type === "legacy") {
                  const parsed = decodeLegacyConfig(trimmed);
                  if (parsed) {
                    sessionStorage.setItem("estuary-config", JSON.stringify(parsed));
                    router.push("/chat");
                  } else {
                    setHashError("Invalid hash. Make sure you copied the full session hash.");
                  }
                } else {
                  setHashError("Unrecognized hash format.");
                }
              }}
              className="w-full py-2.5 rounded border border-accent/50 text-accent-light text-sm font-medium hover:bg-accent/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDecrypting ? "Decrypting..." : "Join Session"}
            </button>
          </div>

          <p className="text-xs text-center text-muted mt-6">
            Powered by{" "}
            <a href="https://www.npmjs.com/package/@estuary-ai/sdk" target="_blank" rel="noopener noreferrer" className="text-accent-light font-medium hover:underline">@estuary-ai/sdk</a>
          </p>
        </div>
      </div>
    </div>
  );
}
