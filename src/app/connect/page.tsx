"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const DEFAULT_SERVER_URL = "https://api.estuary-ai.com";

interface ConnectConfig {
  serverUrl: string;
  apiKey: string;
  characterId: string;
  playerId: string;
}

function decodeConfig(hash: string): ConnectConfig | null {
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

export default function ConnectPage() {
  const router = useRouter();
  const [config, setConfig] = useState<ConnectConfig>({
    serverUrl: DEFAULT_SERVER_URL,
    apiKey: "",
    characterId: "",
    playerId: `demo-user-${Math.random().toString(36).slice(2, 8)}`,
  });
  const [isFromLink, setIsFromLink] = useState(false);

  // Restore saved config or parse shared link
  useEffect(() => {
    const shared = decodeConfig(window.location.hash);
    if (shared) {
      setConfig(shared);
      setIsFromLink(true);
      return;
    }
    const saved = sessionStorage.getItem("estuary-config");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConfig((prev) => ({ ...prev, ...parsed }));
      } catch { /* ignore */ }
    }
  }, []);

  // Auto-connect from shared link
  useEffect(() => {
    if (isFromLink && config.apiKey) {
      sessionStorage.setItem("estuary-config", JSON.stringify(config));
      router.push("/chat");
    }
  }, [isFromLink, config, router]);

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
            <h1 className="text-2xl font-bold tracking-tight">Connect to Estuary</h1>
            <p className="text-sm text-muted mt-1">
              {isFromLink ? "Joining shared session..." : "Enter your credentials to start chatting"}
            </p>
          </div>

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

          <p className="text-xs text-center text-muted mt-6">
            Powered by{" "}
            <span className="text-accent-light font-medium">@estuary-ai/sdk</span>
          </p>
        </div>
      </div>
    </div>
  );
}
