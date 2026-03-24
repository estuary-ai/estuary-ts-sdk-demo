"use client";

import { useState, useRef, useEffect, useCallback, useMemo, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ConnectionState, type CharacterInfo } from "@estuary-ai/sdk";
import { useEstuary, type EstuaryConfig, type EstuarySettings, DEFAULT_SETTINGS } from "@/hooks/useEstuary";
import { encryptWithPassphrase } from "@/lib/crypto";
import type { CharacterState } from "./CharacterAvatar";
import MemoryPanel from "./MemoryPanel";
import SettingsDrawer from "./SettingsDrawer";
import dynamic from "next/dynamic";
import { useIsMobile } from "@/hooks/useIsMobile";

const CharacterViewer = dynamic(() => import("./CharacterViewer"), { ssr: false });

function ConnectionBadge({ state }: { state: ConnectionState }) {
  const config: Record<string, { color: string; label: string }> = {
    [ConnectionState.Connected]: { color: "bg-success", label: "Connected" },
    [ConnectionState.Connecting]: { color: "bg-warning", label: "Connecting" },
    [ConnectionState.Reconnecting]: { color: "bg-warning", label: "Reconnecting" },
    [ConnectionState.Error]: { color: "bg-danger", label: "Error" },
    [ConnectionState.Disconnected]: { color: "bg-muted", label: "Disconnected" },
  };
  const c = config[state] ?? config[ConnectionState.Disconnected];
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <div className={`w-2 h-2 rounded-full ${c.color}`} />
      {c.label}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <div className="typing-dot w-2 h-2 rounded-full bg-accent-light" />
      <div className="typing-dot w-2 h-2 rounded-full bg-accent-light" />
      <div className="typing-dot w-2 h-2 rounded-full bg-accent-light" />
    </div>
  );
}

function deriveCharacterState(
  isVoiceActive: boolean,
  isBotSpeaking: boolean,
  sttText: string,
  hasPendingBotMessage: boolean,
): CharacterState {
  if (isBotSpeaking) return "speaking";
  if (hasPendingBotMessage) return "thinking";
  if (sttText) return "listening";
  if (isVoiceActive) return "listening";
  return "idle";
}

export default function ChatInterface() {
  const router = useRouter();
  const [settings, setSettings] = useState<EstuarySettings>(DEFAULT_SETTINGS);
  const {
    getClient,
    connectionState,
    session,
    messages,
    sttText,
    isVoiceActive,
    isMuted,
    isBotSpeaking,
    botAudioLevel,
    error,
    connect,
    disconnect,
    sendText,
    startVoice,
    stopVoice,
    toggleMute,
    interruptBot,
    setSuppressMicDuringPlayback,
  } = useEstuary();

  const [config, setConfig] = useState<EstuaryConfig | null>(null);
  const [textInput, setTextInput] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copiedField, setCopiedField] = useState<"url" | "hash" | null>(null);
  const [shareHash, setShareHash] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharePassphrase, setSharePassphrase] = useState("");
  const [rightPanel, setRightPanel] = useState<"chat" | "memory">("chat");
  const [characterInfo, setCharacterInfo] = useState<CharacterInfo | null>(null);
  const [splitPct, setSplitPct] = useState(50);
  const [showOverflow, setShowOverflow] = useState(false);
  const isDraggingRef = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shareRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const connectAttemptedRef = useRef(false);
  const isConnected = connectionState === ConnectionState.Connected;
  const isMobile = useIsMobile();

  // Read config from sessionStorage and auto-connect
  useEffect(() => {
    const saved = sessionStorage.getItem("estuary-config");
    if (!saved) {
      router.replace("/");
      return;
    }
    try {
      const parsed = JSON.parse(saved) as EstuaryConfig;
      setConfig(parsed);
    } catch {
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    if (config && !connectAttemptedRef.current) {
      connectAttemptedRef.current = true;
      connect(config, settings).catch(() => {});
    }
  }, [config, connect, settings]);

  // Fetch character info (name, avatar, 3D model URLs) from API
  useEffect(() => {
    if (!config) return;
    fetch(`${config.serverUrl}/api/agents/${config.characterId}`, {
      headers: { "X-API-Key": config.apiKey },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.id) {
          // Resolve relative backend paths (e.g. /static/agent_models/...)
          // to full URLs so the proxy and Three.js loaders can fetch them.
          const resolve = (u: string | null) =>
            u && u.startsWith("/") ? `${config.serverUrl}${u}` : u;
          setCharacterInfo({
            id: data.id,
            name: data.name ?? "",
            tagline: data.tagline ?? null,
            avatar: resolve(data.avatar ?? null),
            modelUrl: resolve(data.modelUrl ?? null),
            modelPreviewUrl: resolve(data.modelPreviewUrl ?? null),
            modelStatus: data.modelStatus ?? null,
            sourceImageUrl: resolve(data.sourceImageUrl ?? null),
          });
        }
      })
      .catch(() => {});
  }, [config]);

  // Sync suppressMicDuringPlayback to the live client (no reconnect needed)
  useEffect(() => {
    setSuppressMicDuringPlayback(settings.suppressMicDuringPlayback);
  }, [settings.suppressMicDuringPlayback, setSuppressMicDuringPlayback]);

  // Drag-to-resize
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMove = (clientX: number) => {
      if (!isDraggingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(80, Math.max(20, pct)));
    };

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);
    const onEnd = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  // Close share modal on click outside
  useEffect(() => {
    if (!showShareModal) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShowShareModal(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showShareModal]);

  // Close overflow menu on click outside
  useEffect(() => {
    if (!showOverflow) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showOverflow]);

  // Derive character state
  const hasPendingBotMessage = useMemo(
    () => messages.some((m) => m.role === "bot" && !m.isFinal),
    [messages]
  );

  const lastBotMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "bot" && messages[i].isFinal) return messages[i];
    }
    return null;
  }, [messages]);

  const isHappyResponse = useMemo(() => {
    if (!lastBotMessage) return false;
    const text = lastBotMessage.text.toLowerCase();
    const happyPatterns = /(!|haha|great|awesome|love|wonderful|amazing|glad|happy|excited|fantastic|thank|welcome|sure thing|of course|absolutely)/;
    return happyPatterns.test(text);
  }, [lastBotMessage]);

  const characterState: CharacterState = useMemo(() => {
    const base = deriveCharacterState(isVoiceActive, isBotSpeaking, sttText, hasPendingBotMessage);
    if (base === "idle" && isHappyResponse) return "happy";
    return base;
  }, [isVoiceActive, isBotSpeaking, sttText, hasPendingBotMessage, isHappyResponse]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    router.push("/");
  }, [disconnect, router]);

  const handleReconnect = useCallback(() => {
    if (!config) return;
    connectAttemptedRef.current = false;
    disconnect();
    connect(config, settings).catch(() => {});
    connectAttemptedRef.current = true;
    setShowSettings(false);
  }, [config, settings, disconnect, connect]);

  const handleSendText = (e: FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    sendText(textInput.trim());
    setTextInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (textInput.trim()) {
        handleSendText(e as unknown as FormEvent);
      }
    }
  };

  const generateShareLink = useCallback(async () => {
    if (!config || !sharePassphrase.trim()) return;
    setIsEncrypting(true);
    setShareError(null);
    try {
      const plaintext = JSON.stringify(config);
      const hash = await encryptWithPassphrase(plaintext, sharePassphrase.trim());
      setShareHash(hash);
      setShareUrl(`${window.location.origin}/#${hash}`);
    } catch {
      setShareError("Encryption failed. Please try again.");
    } finally {
      setIsEncrypting(false);
    }
  }, [config, sharePassphrase]);

  const copyToClipboard = useCallback((text: string, field: "url" | "hash") => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
      }).catch(() => {
        // Fallback for when clipboard API fails
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
      });
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  }, []);

  // Loading state
  if (!config) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <p className="text-muted text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-3">
          {characterInfo?.avatar ? (
            <img
              src={characterInfo.avatar}
              alt={characterInfo.name}
              className="w-8 h-8 rounded-lg object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded bg-accent flex items-center justify-center text-white text-sm font-semibold">
              {characterInfo?.name?.charAt(0).toUpperCase() ?? "E"}
            </div>
          )}
          <div>
            <h1 className="text-sm font-semibold">{characterInfo?.name ?? "Estuary Voice Chat"}</h1>
          </div>
        </div>
        {/* Mobile header actions */}
        <div className="flex md:hidden items-center gap-2">
          <ConnectionBadge state={connectionState} />
          <div className="relative" ref={overflowRef}>
            <button
              onClick={() => setShowOverflow(!showOverflow)}
              className="h-11 w-11 flex items-center justify-center rounded-lg border border-border text-muted hover:text-foreground transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.5"/>
                <circle cx="12" cy="12" r="1.5"/>
                <circle cx="12" cy="19" r="1.5"/>
              </svg>
            </button>

            {showOverflow && (
              <div className="absolute right-0 top-12 w-48 rounded border border-border bg-surface shadow-xl z-50 py-1">
                {process.env.NODE_ENV === "development" && (
                  <>
                    <button onClick={() => { setRightPanel(p => p === "memory" ? "chat" : "memory"); setShowOverflow(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-muted hover:text-foreground hover:bg-surface-light transition">
                      {rightPanel === "memory" ? "Chat" : "Memory Map"}
                    </button>
                    <button onClick={() => { setShowShareModal(true); setShowOverflow(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-muted hover:text-foreground hover:bg-surface-light transition">
                      Share
                    </button>
                  </>
                )}
                {process.env.NODE_ENV === "development" && (
                  <button onClick={() => { setShowSettings(true); setShowOverflow(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-muted hover:text-foreground hover:bg-surface-light transition">
                    Settings
                  </button>
                )}
                <div className="border-t border-border my-1" />
                <button onClick={() => { handleDisconnect(); setShowOverflow(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-danger hover:bg-danger/10 transition">
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Desktop header actions */}
        <div className="hidden md:flex items-center gap-3">
          <ConnectionBadge state={connectionState} />
          {process.env.NODE_ENV === "development" && (
            <>
              <button
                onClick={() => setRightPanel(rightPanel === "memory" ? "chat" : "memory")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition ${
                  rightPanel === "memory"
                    ? "border-accent/50 text-accent-light bg-accent/10"
                    : "border-border text-muted hover:text-accent-light hover:border-accent/50"
                }`}
                title={rightPanel === "memory" ? "Back to Chat" : "Memory Map"}
              >
                {rightPanel === "memory" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                    <path d="M2 12h20" />
                  </svg>
                )}
                {rightPanel === "memory" ? "Chat" : "Memory"}
              </button>
              <div className="relative" ref={shareRef}>
                <button
                  onClick={() => setShowShareModal(!showShareModal)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition ${
                    showShareModal
                      ? "border-accent/50 text-accent-light bg-accent/10"
                      : "border-border text-muted hover:text-accent-light hover:border-accent/50"
                  }`}
                  title="Share"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
                    <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
                  </svg>
                  Share
                </button>
              </div>
            </>
          )}
          {process.env.NODE_ENV === "development" && (
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-accent-light hover:border-accent/50 transition"
              title="Settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </button>
          )}
          <button
            onClick={handleDisconnect}
            className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-danger hover:border-danger/50 transition"
          >
            Disconnect
          </button>
        </div>
      </header>

      {/* Share modal - dev only */}
      {process.env.NODE_ENV === "development" && showShareModal && (
        <div ref={shareRef} className="fixed top-14 left-2 right-2 md:left-auto md:right-4 md:w-96 rounded border border-border bg-surface shadow-xl z-50 animate-fade-in-up">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Share Session</p>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-muted hover:text-foreground transition"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-[11px] text-muted leading-relaxed">
              Your session config is encrypted with AES-256-GCM and a passphrase before sharing.
            </p>

            {/* Passphrase input */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted uppercase tracking-wider">Passphrase</label>
              <input
                type="password"
                value={sharePassphrase}
                onChange={(e) => {
                  setSharePassphrase(e.target.value);
                  setShareHash("");
                  setShareUrl("");
                  setShareError(null);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg bg-surface-light border border-border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
                placeholder="Enter a passphrase..."
              />
            </div>

            {/* Generate button */}
            {!shareUrl && (
              <button
                onClick={generateShareLink}
                disabled={isEncrypting || !sharePassphrase.trim()}
                className="w-full py-2 rounded-lg text-xs font-medium transition bg-accent text-white hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEncrypting ? "Encrypting..." : "Generate Encrypted Link"}
              </button>
            )}
            {shareError && <p className="text-[11px] text-danger">{shareError}</p>}

            {/* Encrypted URL row */}
            {shareUrl && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted uppercase tracking-wider">Encrypted URL</label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-surface-light border border-border text-[11px] font-mono text-muted truncate select-all" title={shareUrl}>
                    {shareUrl}
                  </div>
                  <button
                    onClick={() => copyToClipboard(shareUrl, "url")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${
                      copiedField === "url"
                        ? "bg-success/20 text-success border border-success/30"
                        : "bg-accent text-white hover:bg-accent-light"
                    }`}
                  >
                    {copiedField === "url" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            {/* Encrypted hash row */}
            {shareHash && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted uppercase tracking-wider">Encrypted Hash</label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-surface-light border border-border text-[11px] font-mono text-muted truncate select-all" title={shareHash}>
                    {shareHash}
                  </div>
                  <button
                    onClick={() => copyToClipboard(shareHash, "hash")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${
                      copiedField === "hash"
                        ? "bg-success/20 text-success border border-success/30"
                        : "bg-accent text-white hover:bg-accent-light"
                    }`}
                  >
                    {copiedField === "hash" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            {shareUrl && (
              <div className="flex items-start gap-2 p-2.5 rounded bg-warning/10 border border-warning/20">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-warning shrink-0 mt-0.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" x2="12" y1="9" y2="13" />
                  <line x1="12" x2="12.01" y1="17" y2="17" />
                </svg>
                <p className="text-[11px] text-warning leading-relaxed">
                  Share the passphrase through a different channel than the link.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <div className="rounded bg-danger/10 border border-danger/20 px-4 py-2 text-sm text-danger">
            {error}
          </div>
        </div>
      )}

      {/* Split-screen content */}
      <div ref={splitContainerRef} className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left panel: Character */}
        <div
          className="flex-shrink-0 flex flex-col items-center justify-center bg-background relative h-[33vh] md:h-auto"
          style={isMobile ? undefined : { width: `${splitPct}%` }}
        >

          {/* Character 3D model / profile */}
          <div className="absolute inset-0">
            <CharacterViewer
              modelUrl={characterInfo?.modelUrl ?? null}
              previewModelUrl={characterInfo?.modelPreviewUrl ?? null}
              modelStatus={characterInfo?.modelStatus ?? null}
              avatarUrl={characterInfo?.avatar ?? null}
              state={characterState as "idle" | "listening" | "thinking" | "speaking" | "happy"}
              audioLevel={botAudioLevel}
            />
          </div>

        </div>

        {/* Drag handle */}
        <div
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          className="hidden md:block w-px flex-shrink-0 cursor-col-resize relative group"
        >
          <div className="absolute inset-0 bg-border/60 group-hover:bg-accent/40 transition-colors" />
          <div className="absolute inset-y-0 -left-2 -right-2" />
        </div>

        {/* Right panel: Chat or Memory */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {rightPanel === "chat" ? (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-3">
                  {messages.length === 0 && (
                    <div className="text-center py-12 text-muted text-sm">
                      Send a message or start voice to begin chatting
                    </div>
                  )}
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`animate-fade-in-up flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-accent text-white rounded-br-md"
                            : "bg-surface-light border border-border rounded-bl-md"
                        } ${!msg.isFinal && msg.role === "bot" ? "opacity-80" : ""}`}
                      >
                        {msg.text}
                        {!msg.isFinal && msg.role === "bot" && (
                          <span className="inline-block w-1.5 h-4 bg-accent-light/60 ml-0.5 animate-pulse rounded-sm" />
                        )}
                      </div>
                    </div>
                  ))}

                  {isVoiceActive && isBotSpeaking &&
                    !messages.some((m) => m.role === "bot" && !m.isFinal) &&
                    messages[messages.length - 1]?.role !== "bot" && (
                      <div className="flex justify-start">
                        <div className="bg-surface-light border border-border rounded-2xl rounded-bl-md">
                          <TypingIndicator />
                        </div>
                      </div>
                    )}

                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="flex-shrink-0 bg-surface px-4 py-3 border-t border-border">
                {/* STT live transcription banner */}
                {isVoiceActive && sttText && (
                  <p className="text-xs text-accent-light italic truncate mb-2 px-1">
                    &ldquo;{sttText}&rdquo;
                  </p>
                )}

                <form onSubmit={handleSendText}>
                  <div className="flex items-center bg-surface-light border border-border rounded-2xl px-3 py-1 shadow-sm">
                    {/* Textarea */}
                    <textarea
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={isVoiceActive ? "Voice active — type to send text..." : "Type a message..."}
                      className="bg-transparent border-none focus:ring-0 focus:outline-none resize-none flex-1 min-h-0 max-h-[120px] py-2 text-sm placeholder:text-muted"
                      rows={1}
                      disabled={!isConnected}
                      style={{ boxShadow: "none" }}
                    />

                    {/* Button group */}
                    <div className="flex items-center space-x-1.5 ml-2 flex-shrink-0">
                      {/* Send button */}
                      <button
                        type="submit"
                        disabled={!isConnected || !textInput.trim()}
                        className="rounded-full h-11 w-11 md:h-8 md:w-8 p-0 flex items-center justify-center bg-accent text-white hover:bg-accent-light transition disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Send"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" x2="11" y1="2" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      </button>

                      {isVoiceActive ? (
                        <>
                          {/* Mute toggle */}
                          {(() => {
                            const isSuppressed = isBotSpeaking && settings.suppressMicDuringPlayback;
                            const showMuted = isMuted || isSuppressed;
                            return (
                              <button
                                type="button"
                                onClick={toggleMute}
                                disabled={isSuppressed}
                                className={`rounded-full h-11 w-11 md:h-8 md:w-8 p-0 flex items-center justify-center transition-all ${
                                  isSuppressed
                                    ? "bg-[#9080a8]/20 text-[#9080a8] cursor-not-allowed opacity-75"
                                    : showMuted
                                      ? "bg-warning/20 text-warning"
                                      : "bg-surface text-foreground hover:bg-surface-light"
                                }`}
                                title={isSuppressed ? "Auto-muted during playback" : isMuted ? "Unmute" : "Mute"}
                              >
                                {showMuted ? (
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="1" x2="23" y1="1" y2="23" />
                                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .78-.13 1.53-.36 2.24" />
                                  </svg>
                                ) : (
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                  </svg>
                                )}
                              </button>
                            );
                          })()}

                          {/* Interrupt (only when bot is speaking) */}
                          {isBotSpeaking && (
                            <button
                              type="button"
                              onClick={interruptBot}
                              className="rounded-full h-11 w-11 md:h-8 md:w-8 p-0 flex items-center justify-center bg-danger/20 text-danger hover:bg-danger/30 transition-all"
                              title="Interrupt"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="6" y="6" width="12" height="12" rx="2" />
                              </svg>
                            </button>
                          )}

                          {/* End voice call */}
                          <button
                            type="button"
                            onClick={stopVoice}
                            className="rounded-full h-11 w-11 md:h-8 md:w-8 p-0 flex items-center justify-center bg-danger/20 text-danger hover:bg-danger/30 transition-all"
                            title="End Voice Call"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                              <line x1="23" x2="1" y1="1" y2="23" />
                            </svg>
                          </button>
                        </>
                      ) : (
                        /* Voice call button */
                        <button
                          type="button"
                          onClick={startVoice}
                          disabled={!isConnected}
                          className="rounded-full h-11 w-11 md:h-8 md:w-8 p-0 flex items-center justify-center bg-surface border border-border text-muted hover:text-accent-light hover:border-accent/50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Start Voice Call"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <MemoryPanel getClient={getClient} />
          )}
        </div>
      </div>

      {/* Settings drawer */}
      <SettingsDrawer
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onChange={setSettings}
        onReconnect={handleReconnect}
        isConnected={isConnected}
      />
    </div>
  );
}
