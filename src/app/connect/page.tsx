"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { decrypt, isEncryptedPayload, isLegacyPayload } from "@/lib/crypto";

const DEFAULT_SERVER_URL = "https://api.estuary-ai.com";

interface ConnectConfig {
  serverUrl: string;
  apiKey: string;
  characterId: string;
  playerId: string;
}

function decodeLegacyConfig(hash: string): ConnectConfig | null {
  try {
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!raw) return null;
    const parsed = JSON.parse(atob(raw));
    if (parsed.serverUrl && parsed.apiKey && parsed.characterId && parsed.playerId) {
      return parsed as ConnectConfig;
    }
    return null;
  } catch {
    return null;
  }
}

async function decryptConfig(hash: string, passphrase: string): Promise<ConnectConfig> {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const plaintext = await decrypt(raw, passphrase);
  const parsed = JSON.parse(plaintext);
  if (!parsed.serverUrl || !parsed.apiKey || !parsed.characterId || !parsed.playerId) {
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
  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  // Restore saved config or detect shared link type
  useEffect(() => {
    const hash = window.location.hash;
    if (isEncryptedPayload(hash)) {
      // Encrypted link — needs passphrase
      setEncryptedHash(hash);
      return;
    }
    if (isLegacyPayload(hash)) {
      // Legacy base64 link — still support for backwards compat
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
    if (isFromLink && config.apiKey) {
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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center px-6 md:px-12 py-5">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
      </nav>

      {/* Form */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 mb-4 shadow-lg shadow-indigo-500/20">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="23" />
                <line x1="8" x2="16" y1="23" y2="23" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {encryptedHash ? "Encrypted Session Link" : "Connect to Estuary"}
            </h1>
            <p className="text-sm text-muted mt-1">
              {encryptedHash
                ? "Enter the passphrase to unlock this shared session"
                : isFromLink
                  ? "Joining shared session..."
                  : "Enter your credentials to start chatting"}
            </p>
          </div>

          {/* Passphrase prompt for encrypted links */}
          {encryptedHash && (
            <form onSubmit={handleDecryptLink} className="space-y-4 mb-6">
              <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
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
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium text-sm hover:from-indigo-600 hover:to-violet-700 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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

          <form onSubmit={handleConnect} className="space-y-4">
            <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Server URL</label>
                <input
                  type="url"
                  value={config.serverUrl}
                  onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface-light border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
                  placeholder="https://api.estuary-ai.com"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">API Key</label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface-light border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition font-mono"
                  placeholder="est_..."
                  required
                />
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
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium text-sm hover:from-indigo-600 hover:to-violet-700 transition-all shadow-lg shadow-indigo-500/20"
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
          <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
            <label className="block text-xs font-medium text-muted">Session Hash</label>
            <p className="text-[11px] text-muted leading-relaxed">
              Paste an encrypted session hash and enter the passphrase to connect.
            </p>
            <input
              type="text"
              value={hashInput}
              onChange={(e) => {
                setHashInput(e.target.value);
                setHashError(null);
              }}
              className="w-full px-3 py-2 rounded-lg bg-surface-light border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition font-mono"
              placeholder="Paste encrypted session hash here..."
            />
            {isEncryptedPayload(hashInput.trim()) && (
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
                if (isEncryptedPayload(trimmed)) {
                  if (!passphrase.trim()) {
                    setHashError("Passphrase is required for encrypted hashes.");
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
                } else {
                  // Legacy base64 fallback
                  const parsed = decodeLegacyConfig(trimmed);
                  if (parsed) {
                    sessionStorage.setItem("estuary-config", JSON.stringify(parsed));
                    router.push("/chat");
                  } else {
                    setHashError("Invalid hash. Make sure you copied the full session hash.");
                  }
                }
              }}
              className="w-full py-2.5 rounded-xl border border-accent/50 text-accent-light text-sm font-medium hover:bg-accent/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDecrypting ? "Decrypting..." : "Join Session"}
            </button>
          </div>

          <p className="text-xs text-center text-muted mt-6">
            Powered by{" "}
            <span className="text-accent-light font-medium">@estuary-ai/sdk</span>
          </p>
        </div>
      </div>
    </div>
  );
}
