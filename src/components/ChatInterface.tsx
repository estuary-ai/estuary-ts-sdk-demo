"use client";

import { useState, useRef, useEffect, useCallback, useMemo, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ConnectionState } from "@estuary-ai/sdk";

// Local type definition — published SDK (0.1.24+) exports this, but our
// linked local SDK (0.1.22) doesn't yet. Shape matches the published API.
type CharacterInfo = {
  id: string;
  name: string;
  tagline: string | null;
  avatar: string | null;
  modelUrl: string | null;
  modelPreviewUrl: string | null;
  modelStatus: string | null;
  sourceImageUrl: string | null;
};
import { useEstuary, type EstuaryConfig, type EstuarySettings, DEFAULT_SETTINGS } from "@/hooks/useEstuary";
import { encryptWithPassphrase } from "@/lib/crypto";
import type { CharacterState } from "./CharacterAvatar";
import MemoryPanel from "./MemoryPanel";
import SettingsDrawer from "./SettingsDrawer";
import dynamic from "next/dynamic";
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
    <div className="flex items-center gap-2 text-xs text-white/70">
      <div className={`w-2 h-2 rounded-full ${c.color}`} />
      {c.label}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <div className="typing-dot w-2 h-2 rounded-full bg-gray-400" />
      <div className="typing-dot w-2 h-2 rounded-full bg-gray-400" />
      <div className="typing-dot w-2 h-2 rounded-full bg-gray-400" />
    </div>
  );
}

type ChatMsg = {
  id: string;
  role: "user" | "bot";
  text: string;
  isFinal: boolean;
};

function FullChatLog({
  messages,
  messagesEndRef,
  isVoiceActive,
  isBotSpeaking,
}: {
  messages: ChatMsg[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  isVoiceActive: boolean;
  isBotSpeaking: boolean;
}) {
  return (
    <div className="space-y-3">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`animate-fade-in-up flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`${
              msg.role === "user" ? "max-w-[75%]" : "max-w-[80%]"
            } rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-[#d0e8f5] text-[#1a1a2e] rounded-br-md"
                : "bg-white text-[#1a1a2e] rounded-bl-md shadow-sm"
            } ${!msg.isFinal && msg.role === "bot" ? "opacity-80" : ""}`}
          >
            {msg.text}
            {!msg.isFinal && msg.role === "bot" && (
              <span className="inline-block w-1.5 h-4 bg-accent/50 ml-0.5 animate-pulse rounded-sm" />
            )}
          </div>
        </div>
      ))}

      {isVoiceActive &&
        isBotSpeaking &&
        !messages.some((m) => m.role === "bot" && !m.isFinal) &&
        messages[messages.length - 1]?.role !== "bot" && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-md shadow-sm">
              <TypingIndicator />
            </div>
          </div>
        )}

      <div ref={messagesEndRef} />
    </div>
  );
}

function ChatInputForm({
  textInput,
  setTextInput,
  handleSendText,
  handleKeyDown,
  isVoiceActive,
  sttText,
  isConnected,
  settings,
  isMuted,
  isBotSpeaking,
  toggleMute,
  interruptBot,
  stopVoice,
  startVoice,
  characterName,
  sttClassName,
  wrapperClassName,
}: {
  textInput: string;
  setTextInput: (v: string) => void;
  handleSendText: (e: FormEvent) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  isVoiceActive: boolean;
  sttText: string;
  isConnected: boolean;
  settings: EstuarySettings;
  isMuted: boolean;
  isBotSpeaking: boolean;
  toggleMute: () => void;
  interruptBot: () => void;
  stopVoice: () => void;
  startVoice: () => void;
  characterName?: string;
  sttClassName?: string;
  wrapperClassName?: string;
}) {
  return (
    <div className={wrapperClassName ?? ""}>
      {isVoiceActive && sttText && (
        <p className={`text-xs text-white/70 italic truncate mb-2 px-1 ${sttClassName ?? ""}`}>
          &ldquo;{sttText}&rdquo;
        </p>
      )}
      <div className="flex items-center gap-2">
        <form onSubmit={handleSendText} className="flex-1 min-w-0">
          <div className="flex items-center bg-white rounded-full px-2 py-1 shadow-lg">
            {/* Camera icon */}
            <button
              type="button"
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 transition"
              title="Camera"
              disabled
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Talk to ${characterName || "character"}...`}
              className="bg-transparent border-none focus:ring-0 focus:outline-none resize-none flex-1 min-h-0 max-h-[100px] min-w-0 py-2 text-sm text-gray-900 placeholder:text-gray-400"
              rows={1}
              disabled={!isConnected}
              style={{ boxShadow: "none" }}
            />
            {textInput.trim() ? (
              <button
                type="submit"
                disabled={!isConnected}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-700 transition disabled:opacity-30"
                title="Send"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" x2="11" y1="2" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            ) : textInput.length > 0 ? (
              <button
                type="button"
                onClick={() => setTextInput("")}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-700 transition"
                title="Clear"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>
        </form>

        {/* Voice controls — outside the input pill */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isVoiceActive ? (
            <>
              {(() => {
                const isSuppressed = isBotSpeaking && settings.suppressMicDuringPlayback;
                const showMuted = isMuted || isSuppressed;
                return (
                  <button
                    type="button"
                    onClick={toggleMute}
                    disabled={isSuppressed}
                    className={`rounded-full h-11 w-11 p-0 flex items-center justify-center transition-all ${
                      isSuppressed
                        ? "bg-[#9080a8]/20 text-[#9080a8] cursor-not-allowed opacity-75"
                        : showMuted
                          ? "bg-warning/20 text-warning"
                          : "bg-white/15 text-white hover:bg-white/25"
                    }`}
                    title={isSuppressed ? "Auto-muted during playback" : isMuted ? "Unmute" : "Mute"}
                  >
                    {showMuted ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="1" x2="23" y1="1" y2="23" />
                        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .78-.13 1.53-.36 2.24" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      </svg>
                    )}
                  </button>
                );
              })()}
              {isBotSpeaking && (
                <button
                  type="button"
                  onClick={interruptBot}
                  className="rounded-full h-11 w-11 p-0 flex items-center justify-center bg-danger/20 text-danger hover:bg-danger/30 transition-all"
                  title="Interrupt"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={stopVoice}
                className="rounded-full h-11 w-11 p-0 flex items-center justify-center bg-danger/20 text-danger hover:bg-danger/30 transition-all"
                title="End Voice Call"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                  <line x1="23" x2="1" y1="1" y2="23" />
                </svg>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startVoice}
              disabled={!isConnected}
              className="rounded-full h-11 w-11 p-0 flex items-center justify-center bg-gray-900 text-white hover:bg-gray-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
              title="Start Voice Call"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="23" />
                <line x1="8" x2="16" y1="23" y2="23" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CharacterInfoBlock({ characterInfo }: { characterInfo: CharacterInfo | null }) {
  const name = characterInfo?.name ?? "Estuary Voice Chat";
  return (
    <div className="flex flex-col items-center text-center gap-3 px-2">
      {characterInfo?.avatar ? (
        <img src={characterInfo.avatar} alt={name} className="w-20 h-20 rounded-xl object-cover border border-border" />
      ) : (
        <div className="w-20 h-20 rounded-xl bg-accent flex items-center justify-center text-white text-2xl font-semibold border border-border">
          {characterInfo?.name?.charAt(0).toUpperCase() ?? "E"}
        </div>
      )}
      <h2 className="text-lg font-semibold text-foreground leading-tight">{name}</h2>
      {characterInfo?.tagline ? (
        <p className="text-sm text-foreground leading-relaxed">{characterInfo.tagline}</p>
      ) : null}
      <a
        href="https://www.estuary-ai.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 w-full text-center px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-light transition"
      >
        Build your own characters on Estuary!
      </a>
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
  const [showOverflow, setShowOverflow] = useState(false);
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shareRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const infoDrawerRef = useRef<HTMLDivElement>(null);
  const connectAttemptedRef = useRef(false);
  const isConnected = connectionState === ConnectionState.Connected;

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
    if (!config.apiKey || config.sessionToken) return;
    fetch(`${config.serverUrl}/api/agents/${config.characterId}`, {
      headers: { "X-API-Key": config.apiKey },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.id) {
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

  // Share-link (session token) flows: character info from sessionStorage
  useEffect(() => {
    if (!config) return;
    if (config.apiKey) return;
    const saved = sessionStorage.getItem("estuary-character");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as CharacterInfo;
      const resolve = (u: string | null) =>
        u && u.startsWith("/") ? `${config.serverUrl}${u}` : u;
      setCharacterInfo({
        id: parsed.id,
        name: parsed.name ?? "",
        tagline: parsed.tagline ?? null,
        avatar: resolve(parsed.avatar ?? null),
        modelUrl: resolve(parsed.modelUrl ?? null),
        modelPreviewUrl: resolve(parsed.modelPreviewUrl ?? null),
        modelStatus: parsed.modelStatus ?? null,
        sourceImageUrl: resolve(parsed.sourceImageUrl ?? null),
      });
    } catch {
      // Malformed stash — silently ignore
    }
  }, [config]);

  // Sync suppressMicDuringPlayback to the live client
  useEffect(() => {
    setSuppressMicDuringPlayback(settings.suppressMicDuringPlayback);
  }, [settings.suppressMicDuringPlayback, setSuppressMicDuringPlayback]);

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

  const IS_DEV = process.env.NODE_ENV === "development";

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

  // Auto-scroll messages
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
    if (!textInput.trim() || !isConnected) return;
    sendText(textInput.trim());
    setTextInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (textInput.trim() && isConnected) {
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
    <div className="h-[100dvh] relative overflow-hidden bg-background">
      {/* ── Floating CTA — always visible, top center ── */}
      <a
        href="https://www.estuary-ai.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed left-1/2 -translate-x-1/2 z-50 px-6 py-2.5 md:px-8 md:py-3 rounded-full bg-accent text-white text-sm md:text-base font-semibold shadow-[0_2px_20px_rgba(90,173,207,0.45)] hover:bg-accent-light hover:shadow-[0_2px_24px_rgba(116,192,220,0.55)] hover:scale-[1.03] active:scale-[0.98] transition-all whitespace-nowrap"
        style={{ top: "max(0.75rem, env(safe-area-inset-top, 0.75rem))" }}
      >
        Start building on Estuary
      </a>

      {/* ── Floating top-right controls ── */}
      <div
        className="fixed right-3 z-40 flex items-center gap-2"
        style={{ top: "max(0.75rem, env(safe-area-inset-top, 0.75rem))" }}
      >
        <ConnectionBadge state={connectionState} />
        <div className="relative" ref={overflowRef}>
          <button
            type="button"
            onClick={() => setShowOverflow(!showOverflow)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/50 transition"
            title="Menu"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.5"/>
              <circle cx="12" cy="12" r="1.5"/>
              <circle cx="12" cy="19" r="1.5"/>
            </svg>
          </button>
          {showOverflow && (
            <div className="absolute right-0 top-11 w-48 rounded-xl border border-white/10 bg-surface/95 backdrop-blur-md shadow-xl z-50 py-1 overflow-hidden">
              <button
                type="button"
                onClick={() => { setShowInfoDrawer(true); setShowOverflow(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-surface-light transition"
              >
                Character info
              </button>
              {IS_DEV && (
                <>
                  <button onClick={() => { setRightPanel(p => p === "memory" ? "chat" : "memory"); setShowOverflow(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-surface-light transition">
                    {rightPanel === "memory" ? "Chat" : "Memory Map"}
                  </button>
                  <button onClick={() => { setShowShareModal(true); setShowOverflow(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-surface-light transition">
                    Share
                  </button>
                  <button onClick={() => { setShowSettings(true); setShowOverflow(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-surface-light transition">
                    Settings
                  </button>
                </>
              )}
              <div className="border-t border-white/10 my-1" />
              <button onClick={() => { handleDisconnect(); setShowOverflow(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-surface-light transition">
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── 3D Character — positioned on the left, stays in view on keyboard open ── */}
      <div className="absolute left-0 bottom-16 w-[55%] h-[55%] md:bottom-16 md:w-1/3 md:h-[70%] z-0">
        <CharacterViewer
          modelUrl={characterInfo?.modelUrl ?? null}
          previewModelUrl={characterInfo?.modelPreviewUrl ?? null}
          modelStatus={characterInfo?.modelStatus ?? null}
          avatarUrl={characterInfo?.avatar ?? null}
          state={characterState as "idle" | "listening" | "thinking" | "speaking" | "happy"}
          audioLevel={botAudioLevel}
        />
      </div>

      {/* ── Chat messages + Input overlay ── */}
      <div className="relative z-10 h-full flex flex-col pointer-events-none">
        {/* Scrollable messages — right 2/3 on desktop */}
        <div className="flex-1 overflow-y-auto pt-16 pb-2 px-4 md:pl-[33.333%] pointer-events-auto">
          {IS_DEV && rightPanel === "memory" ? (
            <MemoryPanel getClient={getClient} />
          ) : (
            <FullChatLog
              messages={messages as ChatMsg[]}
              messagesEndRef={messagesEndRef}
              isVoiceActive={isVoiceActive}
              isBotSpeaking={isBotSpeaking}
            />
          )}
        </div>

        {/* Input bar — pinned to bottom */}
        <div
          className="shrink-0 px-3 pt-1 pointer-events-auto"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 1rem))" }}
        >
          <ChatInputForm
            textInput={textInput}
            setTextInput={setTextInput}
            handleSendText={handleSendText}
            handleKeyDown={handleKeyDown}
            isVoiceActive={isVoiceActive}
            sttText={sttText}
            isConnected={isConnected}
            settings={settings}
            isMuted={isMuted}
            isBotSpeaking={isBotSpeaking}
            toggleMute={toggleMute}
            interruptBot={interruptBot}
            stopVoice={stopVoice}
            startVoice={startVoice}
            characterName={characterInfo?.name}
          />
        </div>
      </div>

      {/* ── Share modal — dev only ── */}
      {IS_DEV && showShareModal && (
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

      {/* ── Error toast ── */}
      {error && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <div className="rounded-xl bg-danger/90 backdrop-blur-sm px-4 py-2 text-sm text-white shadow-lg">
            {error}
          </div>
        </div>
      )}

      {/* ── Character info drawer ── */}
      {showInfoDrawer && (
        <>
          <button
            type="button"
            aria-label="Close character info"
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowInfoDrawer(false)}
          />
          <div
            ref={infoDrawerRef}
            className="fixed top-0 right-0 h-full w-[min(100%,20rem)] z-50 border-l border-border bg-surface shadow-xl flex flex-col transition-transform duration-200 ease-out translate-x-0"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <span className="text-sm font-medium">Character</span>
              <button
                type="button"
                onClick={() => setShowInfoDrawer(false)}
                className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4">
              <CharacterInfoBlock characterInfo={characterInfo} />
            </div>
          </div>
        </>
      )}

      {/* ── Settings drawer ── */}
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
