"use client";

import { useState, useRef, useEffect, useCallback, useMemo, type FormEvent } from "react";
import { ConnectionState } from "@estuary-ai/sdk";
import { useEstuary, type EstuaryConfig } from "@/hooks/useEstuary";
import CharacterAvatar, { type CharacterState } from "./CharacterAvatar";
import MemoryPanel from "./MemoryPanel";

const DEFAULT_SERVER_URL = "https://api.estuary-ai.com";

function encodeConfig(config: EstuaryConfig): string {
  return btoa(JSON.stringify(config));
}

function decodeConfig(hash: string): EstuaryConfig | null {
  try {
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!raw) return null;
    const parsed = JSON.parse(atob(raw));
    if (parsed.serverUrl && parsed.apiKey && parsed.characterId && parsed.playerId) {
      return parsed as EstuaryConfig;
    }
    return null;
  } catch {
    return null;
  }
}

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

export default function ChatApp() {
  const {
    getClient,
    connectionState,
    session,
    messages,
    sttText,
    isVoiceActive,
    isMuted,
    isBotSpeaking,
    error,
    connect,
    disconnect,
    sendText,
    startVoice,
    stopVoice,
    toggleMute,
    interruptBot,
  } = useEstuary();

  const [config, setConfig] = useState<EstuaryConfig>({
    serverUrl: DEFAULT_SERVER_URL,
    apiKey: "",
    characterId: "",
    playerId: `demo-user-${Math.random().toString(36).slice(2, 8)}`,
  });

  const [textInput, setTextInput] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isFromLink, setIsFromLink] = useState(false);
  const [rightPanel, setRightPanel] = useState<"chat" | "memory">("chat");
  const [splitPct, setSplitPct] = useState(50); // left panel width %
  const isDraggingRef = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const autoConnectRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isConnected = connectionState === ConnectionState.Connected;

  // Drag-to-resize handlers
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

  // Derive character state from conversation
  const hasPendingBotMessage = useMemo(
    () => messages.some((m) => m.role === "bot" && !m.isFinal),
    [messages]
  );

  // Detect "happy" from final bot messages containing positive sentiment words
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
    // Override to "happy" briefly after a positive bot response (when idle)
    if (base === "idle" && isHappyResponse) return "happy";
    return base;
  }, [isVoiceActive, isBotSpeaking, sttText, hasPendingBotMessage, isHappyResponse]);

  // Parse shared config from URL hash on mount
  useEffect(() => {
    const shared = decodeConfig(window.location.hash);
    if (shared) {
      setConfig(shared);
      setIsFromLink(true);
      autoConnectRef.current = true;
    }
  }, []);

  // Auto-connect when loaded from a shared link
  useEffect(() => {
    if (autoConnectRef.current && config.apiKey) {
      autoConnectRef.current = false;
      setIsConnecting(true);
      connect(config)
        .catch(() => {})
        .finally(() => setIsConnecting(false));
    }
  }, [config, connect]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleConnect = async (e: FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    try {
      await connect(config);
    } catch {
      // error is set in the hook
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSendText = (e: FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    sendText(textInput.trim());
    setTextInput("");
  };

  const generateShareLink = useCallback(() => {
    const url = new URL(window.location.href.split("#")[0]);
    url.hash = encodeConfig(config);
    const link = url.toString();
    setShareLink(link);
    navigator.clipboard.writeText(link).catch(() => {});
  }, [config]);

  // --- Setup Screen ---
  if (!isConnected && connectionState !== ConnectionState.Connecting && connectionState !== ConnectionState.Reconnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        {/* Background gradient blobs */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="23" />
                <line x1="8" x2="16" y1="23" y2="23" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Estuary Voice Chat</h1>
            <p className="text-sm text-muted mt-1">
              {isFromLink ? "Joining shared session..." : "Real-time AI conversation demo"}
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

            {error && (
              <div className="rounded-lg bg-danger/10 border border-danger/20 px-4 py-2.5 text-sm text-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isConnecting}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium text-sm hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnecting ? "Connecting..." : "Connect"}
            </button>
          </form>

          <p className="text-xs text-center text-muted mt-6">
            Powered by{" "}
            <span className="text-accent-light font-medium">@estuary-ai/sdk</span>
          </p>
        </div>
      </div>
    );
  }

  // --- Split-Screen Chat + Character ---
  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface/50 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold">Estuary Voice Chat</h1>
            {session && (
              <p className="text-[10px] text-muted font-mono truncate max-w-[200px]">
                {session.sessionId.slice(0, 8)}...
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionBadge state={connectionState} />
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
          <button
            onClick={generateShareLink}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-accent-light hover:border-accent/50 transition"
            title="Copy invite link"
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
          <button
            onClick={disconnect}
            className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-danger hover:border-danger/50 transition"
          >
            Disconnect
          </button>
        </div>
      </header>

      {/* Share link toast */}
      {shareLink && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <div className="rounded-lg bg-surface border border-border px-4 py-3 shadow-lg backdrop-blur-sm max-w-md">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-xs font-medium text-foreground">Invite link copied to clipboard!</p>
              <button
                onClick={() => setShareLink(null)}
                className="text-muted hover:text-foreground text-xs"
              >
                Dismiss
              </button>
            </div>
            <p className="text-[10px] text-muted font-mono break-all select-all leading-relaxed">
              {shareLink}
            </p>
            <p className="text-[10px] text-muted mt-2">
              Anyone with this link can chat with the same character using your credentials.
            </p>
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <div className="rounded-lg bg-danger/10 border border-danger/20 px-4 py-2 text-sm text-danger backdrop-blur-sm">
            {error}
          </div>
        </div>
      )}

      {/* Split-screen content */}
      <div ref={splitContainerRef} className="flex-1 flex overflow-hidden">
        {/* Left panel: Character avatar + voice controls */}
        <div style={{ width: `${splitPct}%` }} className="flex-shrink-0 flex flex-col items-center justify-center bg-gradient-to-b from-surface to-background relative">
          {/* Subtle background decoration */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-indigo-600/5 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-violet-600/5 rounded-full blur-3xl" />
          </div>

          {/* Character */}
          <div className="relative w-full max-w-sm aspect-[4/5] mx-auto">
            <CharacterAvatar state={characterState} />
          </div>

          {/* State label */}
          <div className="mt-2 text-xs text-muted capitalize tracking-wide">
            {characterState === "idle" && !isVoiceActive && "Ready to chat"}
            {characterState === "idle" && isVoiceActive && "Listening..."}
            {characterState === "listening" && "Listening..."}
            {characterState === "thinking" && "Thinking..."}
            {characterState === "speaking" && "Speaking..."}
            {characterState === "happy" && "Happy"}
          </div>

          {/* Voice controls */}
          <div className="mt-6 flex justify-center gap-3">
            {!isVoiceActive ? (
              <button
                onClick={startVoice}
                disabled={!isConnected}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-medium hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                </svg>
                Start Voice
              </button>
            ) : (
              <>
                <button
                  onClick={toggleMute}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
                    isMuted
                      ? "bg-amber-600/20 text-amber-400 border border-amber-600/30"
                      : "bg-surface-light text-foreground border border-border hover:bg-surface"
                  }`}
                >
                  {isMuted ? (
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
                  {isMuted ? "Unmute" : "Mute"}
                </button>
                {isBotSpeaking && (
                  <button
                    onClick={interruptBot}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-danger/20 text-danger border border-danger/30 text-sm font-medium hover:bg-danger/30 transition-all"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    Interrupt
                  </button>
                )}
                <button
                  onClick={stopVoice}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-light text-danger border border-border text-sm font-medium hover:border-danger/50 transition-all"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                  Stop
                </button>
              </>
            )}
          </div>

          {/* Live STT text */}
          {sttText && (
            <div className="mt-4 px-6 max-w-sm">
              <p className="text-sm text-accent-light text-center italic truncate">
                &ldquo;{sttText}&rdquo;
              </p>
            </div>
          )}
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          className="w-1.5 flex-shrink-0 cursor-col-resize relative group"
        >
          <div className="absolute inset-0 bg-border group-hover:bg-accent/50 transition-colors" />
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>

        {/* Right panel: Chat or Memory Map */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {rightPanel === "chat" ? (
            <>
              {/* Messages */}
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

                  {isBotSpeaking &&
                    !messages.some((m) => m.role === "bot" && !m.isFinal) && (
                      <div className="flex justify-start">
                        <div className="bg-surface-light border border-border rounded-2xl rounded-bl-md">
                          <TypingIndicator />
                        </div>
                      </div>
                    )}

                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Text input */}
              <div className="flex-shrink-0 p-4 border-t border-border bg-surface/50 backdrop-blur-sm">
                <form
                  onSubmit={handleSendText}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-surface-light border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition placeholder:text-muted"
                    disabled={!isConnected}
                  />
                  <button
                    type="submit"
                    disabled={!isConnected || !textInput.trim()}
                    className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-light transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send
                  </button>
                </form>
              </div>
            </>
          ) : (
            <MemoryPanel getClient={getClient} />
          )}
        </div>
      </div>
    </div>
  );
}
