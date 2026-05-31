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
  personality: string | null;
  avatar: string | null;
  modelUrl: string | null;
  modelPreviewUrl: string | null;
  modelStatus: string | null;
  sourceImageUrl: string | null;
};
import { useEstuary, type EstuaryConfig, type EstuarySettings, DEFAULT_SETTINGS } from "@/hooks/useEstuary";
import type { CharacterState } from "./CharacterAvatar";
import MemoryPanel from "./MemoryPanel";
import SettingsDrawer from "./SettingsDrawer";
import { useTheme } from "./ThemeProvider";
import dynamic from "next/dynamic";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read error"));
    reader.readAsDataURL(file);
  });
}

function stripDataUrlPrefix(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [rotating, setRotating] = useState(false);
  const isLight = theme === "light";

  const handleClick = () => {
    setRotating(true);
    toggleTheme();
    setTimeout(() => setRotating(false), 350);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-9 h-9 flex items-center justify-center rounded-full bg-foreground/10 backdrop-blur-sm text-foreground/80 hover:text-foreground hover:bg-foreground/20 transition-colors ${rotating ? "animate-theme-rotate" : ""}`}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      aria-label="Toggle theme"
    >
      {isLight ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
const CharacterViewer = dynamic(() => import("./CharacterViewer"), { ssr: false });

// Default characters (axiom/manny/whiskers) ship as bare keys in the `avatar`
// field. The gateway serves their PNGs at /static/agent_images/.
const DEFAULT_AVATAR_PATHS: Record<string, string> = {
  axiom: "/static/agent_images/Estuary_Axolotl.png",
  whiskers: "/static/agent_images/Estuary_Cat.png",
  manny: "/static/agent_images/Estuary_Manatee.png",
};

function resolveAvatarUrl(serverUrl: string, u: string | null): string | null {
  if (!u) return u;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (DEFAULT_AVATAR_PATHS[u]) return `${serverUrl}${DEFAULT_AVATAR_PATHS[u]}`;
  if (u.startsWith("static/") || u.startsWith("/static/")) {
    return `${serverUrl}/static/${u.replace(/^\/?static\//, "")}`;
  }
  if (u.startsWith("/")) return `${serverUrl}${u}`;
  return null;
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
    <div className="flex items-center gap-2 text-xs text-foreground/70">
      <div className={`w-2 h-2 rounded-full ${c.color}`} />
      {c.label}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <div className="typing-dot w-2 h-2 rounded-full bg-muted" />
      <div className="typing-dot w-2 h-2 rounded-full bg-muted" />
      <div className="typing-dot w-2 h-2 rounded-full bg-muted" />
    </div>
  );
}

// Typewriter reveal. Mirrors estuary-frontend/chat-interface.tsx:
// 66 chars/sec, RAF-driven with elapsed-time pacing so the perceived rate stays
// constant across 60/120/144Hz displays. Clock pauses while there's nothing to
// drain so debt doesn't burst out when the next chunk lands. Drift (final text
// not a prefix of what's been shown — e.g. backend rewrote earlier content or
// smart-spacing diverged) resets the display so the bubble always converges to
// the target.
const CHARS_PER_SEC = 66;
const CHARS_PER_MS = CHARS_PER_SEC / 1000;

function TypewriterText({
  text,
  isFinal,
  onTick,
}: {
  text: string;
  isFinal: boolean;
  onTick?: () => void;
}) {
  const [displayed, setDisplayed] = useState("");
  const displayedRef = useRef("");
  const targetRef = useRef(text);
  const isFinalRef = useRef(isFinal);
  const rafIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const fractionalCharsRef = useRef(0);
  const onTickRef = useRef(onTick);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    targetRef.current = text;
    isFinalRef.current = isFinal;

    // Drift: if what we've already shown isn't a prefix of the new target,
    // restart from empty so the bubble eventually converges.
    if (!text.startsWith(displayedRef.current)) {
      displayedRef.current = "";
      setDisplayed("");
      lastFrameTimeRef.current = null;
      fractionalCharsRef.current = 0;
    }

    const tick = (now: number) => {
      const target = targetRef.current;
      const current = displayedRef.current;
      const remaining = target.length - current.length;

      if (remaining > 0) {
        if (lastFrameTimeRef.current === null) {
          lastFrameTimeRef.current = now;
        }
        const elapsed = now - lastFrameTimeRef.current;
        fractionalCharsRef.current += elapsed * CHARS_PER_MS;

        const wholeChars = Math.floor(fractionalCharsRef.current);
        if (wholeChars > 0) {
          const take = Math.min(wholeChars, remaining);
          fractionalCharsRef.current -= take;
          const next = target.slice(0, current.length + take);
          displayedRef.current = next;
          setDisplayed(next);
          onTickRef.current?.();
        }
      } else {
        lastFrameTimeRef.current = null;
        fractionalCharsRef.current = 0;
      }

      lastFrameTimeRef.current = now;

      // Stop the loop once we've caught up to a finalized target. For
      // non-final targets keep ticking — the buffer-empty branch above parks
      // the clock so we resume at full speed when more text arrives.
      if (
        displayedRef.current.length >= targetRef.current.length &&
        isFinalRef.current
      ) {
        rafIdRef.current = null;
        return;
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    if (rafIdRef.current === null && displayedRef.current.length < text.length) {
      lastFrameTimeRef.current = null;
      fractionalCharsRef.current = 0;
      rafIdRef.current = requestAnimationFrame(tick);
    } else if (
      rafIdRef.current === null &&
      !isFinal &&
      displayedRef.current.length === text.length
    ) {
      // Streaming idle: keep the loop alive so we tick as soon as the next
      // chunk extends the target.
      lastFrameTimeRef.current = null;
      fractionalCharsRef.current = 0;
      rafIdRef.current = requestAnimationFrame(tick);
    }
  }, [text, isFinal]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  const isTyping = displayed.length < text.length || !isFinal;

  return (
    <>
      {displayed}
      {isTyping && (
        <span className="inline-block w-1.5 h-4 bg-accent/50 ml-0.5 animate-pulse rounded-sm align-middle" />
      )}
    </>
  );
}

type ChatMsg = {
  id: string;
  role: "user" | "bot";
  text: string;
  isFinal: boolean;
  imageDataUrl?: string;
};

function FullChatLog({
  messages,
  messagesEndRef,
  lastMessageRef,
  isVoiceActive,
  isBotSpeaking,
  isProcessingImage,
}: {
  messages: ChatMsg[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  lastMessageRef: React.RefObject<HTMLDivElement | null>;
  isVoiceActive: boolean;
  isBotSpeaking: boolean;
  isProcessingImage: boolean;
}) {
  return (
    <div className="space-y-3">
      {messages.map((msg, i) => (
        <div
          key={msg.id}
          ref={i === messages.length - 1 ? lastMessageRef : undefined}
          className={`animate-fade-in-up flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[85%] rounded-lg text-sm leading-relaxed chat-message ${
              msg.role === "user"
                ? "bg-accent text-white"
                : "bg-surface-light text-foreground"
            } ${!msg.isFinal && msg.role === "bot" ? "opacity-70" : ""} ${msg.imageDataUrl ? "p-1.5" : "p-3"}`}
          >
            {msg.imageDataUrl && (
              <img
                src={msg.imageDataUrl}
                alt="Attached"
                className="max-w-[240px] max-h-[200px] rounded-xl object-contain block"
              />
            )}
            {msg.text && (
              <div className={msg.imageDataUrl ? "px-2.5 py-1.5" : ""}>
                {msg.role === "bot" ? (
                  <TypewriterText
                    text={msg.text}
                    isFinal={msg.isFinal}
                    onTick={() =>
                      messagesEndRef.current?.scrollIntoView({ behavior: "instant" })
                    }
                  />
                ) : (
                  msg.text
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {isVoiceActive &&
        isBotSpeaking &&
        !isProcessingImage &&
        !messages.some((m) => m.role === "bot" && !m.isFinal) &&
        messages[messages.length - 1]?.role !== "bot" && (
          <div className="flex justify-start">
            <div className="bg-surface-light rounded-lg">
              <TypingIndicator />
            </div>
          </div>
        )}

      <div ref={messagesEndRef} />
    </div>
  );
}

type PendingImage = { file: File; previewUrl: string };

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
  pendingImage,
  onPickImage,
  onRemoveImage,
  onPasteImage,
  onDropImage,
  uploadError,
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
  pendingImage: PendingImage | null;
  onPickImage: (file: File) => void;
  onRemoveImage: () => void;
  onPasteImage: (file: File) => void;
  onDropImage: (file: File) => void;
  uploadError: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const canSend = isConnected && (textInput.trim().length > 0 || pendingImage !== null);

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setIsDragOver(true);
    }
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (file) onDropImage(file);
  };
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          onPasteImage(file);
          return;
        }
      }
    }
  };

  return (
    <div className={wrapperClassName ?? ""}>
      {isVoiceActive && sttText && (
        <p className={`text-xs text-foreground/70 italic truncate mb-2 px-1 ${sttClassName ?? ""}`}>
          &ldquo;{sttText}&rdquo;
        </p>
      )}
      {uploadError && (
        <p className="text-sm text-danger mb-2 px-1">{uploadError}</p>
      )}
      <div className="flex items-end gap-2">
        <form onSubmit={handleSendText} className="flex-1 min-w-0">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickImage(file);
              e.target.value = "";
            }}
          />
          <div
            className={`bg-surface ${pendingImage ? "rounded-2xl" : "rounded-full"} px-1.5 py-1 shadow-lg border transition ${
              isDragOver ? "border-accent ring-2 ring-accent/40" : "border-border"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {pendingImage && (
              // Attachment tray: a single thumbnail tile, left-aligned with the
              // attach button in the input row below it (no extra horizontal
              // padding) so the composer reads as one cohesive unit. Mirrors the
              // ChatGPT/Claude image composer; no filename, to avoid an empty gap.
              <div className="flex pt-1.5 pb-1">
                <div className="relative shrink-0">
                  <img
                    src={pendingImage.previewUrl}
                    alt={pendingImage.file.name}
                    className="w-14 h-14 rounded-xl object-cover border border-border"
                  />
                  <button
                    type="button"
                    onClick={onRemoveImage}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center shadow-md ring-2 ring-surface hover:opacity-80 transition"
                    title="Remove attachment"
                    aria-label={`Remove ${pendingImage.file.name}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!isConnected || !!pendingImage}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-muted hover:text-foreground hover:bg-foreground/5 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:bg-transparent"
                title={pendingImage ? "Remove the current image to attach another" : "Attach image"}
                aria-label="Attach image"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={pendingImage ? "Add a message (optional)…" : `Talk to ${characterName || "character"}...`}
                className="bg-transparent border-none focus:ring-0 focus:outline-none resize-none flex-1 min-h-0 max-h-[120px] min-w-0 py-2 text-sm text-foreground placeholder:text-muted placeholder:leading-6 chat-message"
                rows={1}
                disabled={!isConnected}
                style={{ boxShadow: "none" }}
              />
              {canSend ? (
                <button
                  type="submit"
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-accent text-white hover:bg-accent-light transition"
                  title="Send"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" x2="11" y1="2" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              ) : textInput.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setTextInput("")}
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-accent text-white hover:bg-accent-light transition"
                  title="Clear"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
        </form>

        {/* Voice controls — outside the input pill. Bottom-aligned (items-end on
            the parent row + pb-1 here) so they stay level with the input row when
            an attachment tray grows the composer upward or the textarea wraps. */}
        <div className="flex items-center gap-1.5 flex-shrink-0 pb-1">
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
                    className={`rounded-full h-10 w-10 p-0 flex items-center justify-center transition-all ${
                      isSuppressed
                        ? "bg-muted/20 text-muted cursor-not-allowed opacity-75"
                        : showMuted
                          ? "bg-warning/20 text-warning"
                          : "bg-foreground/10 text-foreground hover:bg-foreground/20"
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
                  className="rounded-full h-10 w-10 p-0 flex items-center justify-center bg-danger/20 text-danger hover:bg-danger/30 transition-all"
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
                className="rounded-full h-10 w-10 p-0 flex items-center justify-center bg-danger/20 text-danger hover:bg-danger/30 transition-all"
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
              className="rounded-full h-10 w-10 p-0 flex items-center justify-center bg-accent text-white hover:bg-accent-light transition disabled:opacity-30 disabled:cursor-not-allowed"
              title="Start Voice Call"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
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
      <h2 className="text-lg font-bold text-foreground leading-tight">{name}</h2>
      {characterInfo?.tagline ? (
        <p className="text-sm text-muted leading-relaxed">{characterInfo.tagline}</p>
      ) : null}
      {characterInfo?.personality ? (
        <div className="w-full text-left mt-1">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Personality</p>
          <p className="text-sm text-foreground/80 leading-relaxed">{characterInfo.personality}</p>
        </div>
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
  isProcessingImage: boolean,
  awaitingResponse: boolean,
): CharacterState {
  if (isBotSpeaking) return "speaking";
  // A just-sent message, image analysis, and a pending bot reply all put the
  // character in the thinking state (faces forward + breathing + blue glow)
  // while it works. awaitingResponse bridges the gap between send and the
  // bot's first streamed token so the character faces forward immediately.
  if (awaitingResponse || isProcessingImage || hasPendingBotMessage) return "thinking";
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
    isProcessingImage,
    connect,
    disconnect,
    sendText,
    sendImage,
    startVoice,
    stopVoice,
    toggleMute,
    interruptBot,
    setSuppressMicDuringPlayback,
  } = useEstuary();

  const [config, setConfig] = useState<EstuaryConfig | null>(null);
  const [textInput, setTextInput] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Set the instant the user sends a message so the character faces forward
  // right away, before the bot's first token arrives. Cleared once a real
  // response signal (pending bot message / speaking / image analysis) takes
  // over, or by a safety timeout.
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const awaitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [rightPanel, setRightPanel] = useState<"chat" | "memory">("chat");
  const [activeSidePanel, setActiveSidePanel] = useState<"character" | "memory" | "settings">("character");
  const [sidePanelMenuOpen, setSidePanelMenuOpen] = useState(false);
  const sidePanelMenuRef = useRef<HTMLDivElement>(null);
  const [characterInfo, setCharacterInfo] = useState<CharacterInfo | null>(null);
  const [showOverflow, setShowOverflow] = useState(false);
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const characterFloatRef = useRef<HTMLDivElement>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const newestRoleRef = useRef<"user" | "bot" | null>(null);
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
    // The connect page stashes the URL the user arrived on (share token /
    // encrypted hash / legacy hash) so we can hand it back via the Share menu.
    // Absent when the session was configured by hand on the connect form.
    setShareUrl(sessionStorage.getItem("estuary-share-url"));
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
          const resolve = (u: string | null) => resolveAvatarUrl(config.serverUrl, u);
          setCharacterInfo({
            id: data.id,
            name: data.name ?? "",
            tagline: data.tagline ?? null,
            personality: data.personality ?? null,
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
      const resolve = (u: string | null) => resolveAvatarUrl(config.serverUrl, u);
      setCharacterInfo({
        id: parsed.id,
        name: parsed.name ?? "",
        tagline: parsed.tagline ?? null,
        personality: parsed.personality ?? null,
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

  // Close side panel dropdown on click outside
  useEffect(() => {
    if (!sidePanelMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (sidePanelMenuRef.current && !sidePanelMenuRef.current.contains(e.target as Node)) {
        setSidePanelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sidePanelMenuOpen]);

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
    const base = deriveCharacterState(isVoiceActive, isBotSpeaking, sttText, hasPendingBotMessage, isProcessingImage, awaitingResponse);
    if (base === "idle" && isHappyResponse) return "happy";
    return base;
  }, [isVoiceActive, isBotSpeaking, sttText, hasPendingBotMessage, isHappyResponse, isProcessingImage, awaitingResponse]);

  // Characters with only a 2D avatar (no glb/preview model) skip the 3D viewer
  // and render a centered estuary-frontend-style chat layout instead.
  const has3DModel = useMemo(() => {
    if (!characterInfo) return false;
    if (characterInfo.modelUrl) return true;
    if (
      characterInfo.modelPreviewUrl &&
      (characterInfo.modelStatus === "preview_ready" || characterInfo.modelStatus === "generating")
    ) {
      return true;
    }
    return false;
  }, [characterInfo]);

  // Auto-scroll messages + remember whose message is newest (drives the float).
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    const list = messages as ChatMsg[];
    newestRoleRef.current = list.length ? list[list.length - 1].role : null;
  }, [messages]);

  // Gentle vertical float: the 3D character drifts toward the newest message so it
  // appears to follow the conversation — rising to your message, then settling down
  // to its own reply once it speaks.
  //
  //   • It lines the character's FACE (≈0.4 down its canvas, since the model is framed
  //     centered) up with the bubble — anchoring the canvas top instead left it sitting
  //     too low, because the top of the canvas is transparent headroom.
  //   • A per-turn ROLE BOB makes the direction read clearly every turn regardless of
  //     scroll position: when your message is newest the character lifts up by
  //     USER_LIFT; when the bot's reply is newest it has no lift, so it floats back
  //     down. (The bot's bubble also renders below yours, reinforcing the descent.)
  //   • It only ever floats *up* from its resting bottom anchor, never below it, and
  //     never above the top edge of the main area.
  //
  // RAF-lerped for a soft, frame-rate-independent glide that also tracks live message
  // growth, scroll, and resize.
  useEffect(() => {
    if (!has3DModel) return;
    // Where the character's face/visible-center sits in its canvas, as a fraction
    // from the top (the model is framed centered, so ~0.4 lands around the face /
    // upper chest). Raise this to lift the character higher relative to the bubble.
    const FACE_FRAC = 0.4;
    const USER_LIFT = 24; // extra upward drift while your message is the newest
    const TOP_PAD = 48;   // keep the face at least this far below the main-area top
    let rafId = 0;
    let last = performance.now();
    let applied = 0; // currently applied translateY in px

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const charEl = characterFloatRef.current;
      const mainEl = mainAreaRef.current;
      const msgEl = lastMessageRef.current;

      let desired = 0; // rest position when there's nothing to track
      if (charEl && mainEl) {
        const mainRect = mainEl.getBoundingClientRect();
        const charRect = charEl.getBoundingClientRect();
        const msgRect = msgEl?.getBoundingClientRect();
        // Natural (untransformed) geometry by backing out the applied offset.
        const naturalTop = charRect.top - applied;
        // The point on the character we line up with the bubble — its face, not the
        // canvas top (which is transparent headroom, hence the old "too low").
        const faceNatural = naturalTop + FACE_FRAC * charRect.height;
        // Up bound: keep the face within TOP_PAD of the main-area top so the head
        // stays on screen (the transparent canvas top is free to clip off above it).
        const minTranslate = mainRect.top + TOP_PAD - faceNatural;
        // Only track a visible message (height 0 => hidden, e.g. memory view).
        if (msgRect && msgRect.height > 0) {
          const targetCenter = msgRect.top + msgRect.height / 2;
          // Line the character's face up with the bubble; negative => float up.
          const posTranslate = Math.min(0, targetCenter - faceNatural);
          // Lift up for your turn; settle down for the bot's reply.
          const roleLift = newestRoleRef.current === "user" ? -USER_LIFT : 0;
          desired = Math.max(minTranslate, posTranslate + roleLift);
        }
        const alpha = 1 - Math.exp(-dt * 4); // ~gentle glide
        applied += (desired - applied) * alpha;
        if (Math.abs(applied) < 0.1) applied = 0;
        charEl.style.transform = applied ? `translateY(${applied.toFixed(2)}px)` : "";
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [has3DModel]);

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

  const acceptImageFile = useCallback((file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setUploadError("Unsupported image type. Use PNG, JPEG, WebP, or GIF.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError("Image is too large (max 20 MB).");
      return;
    }
    setUploadError(null);
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
  }, []);

  const clearPendingImage = useCallback(() => {
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setUploadError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    };
    // Cleanup on unmount only; pendingImage URL is revoked on replace/clear above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markAwaitingResponse = useCallback(() => {
    setAwaitingResponse(true);
    if (awaitingTimerRef.current) clearTimeout(awaitingTimerRef.current);
    // Safety: never leave the character stuck "thinking" if nothing arrives.
    awaitingTimerRef.current = setTimeout(() => setAwaitingResponse(false), 10000);
  }, []);

  // Hand off from the just-sent bridge to the real response signals (or an error).
  useEffect(() => {
    if (awaitingResponse && (hasPendingBotMessage || isBotSpeaking || isProcessingImage || error)) {
      setAwaitingResponse(false);
      if (awaitingTimerRef.current) clearTimeout(awaitingTimerRef.current);
    }
  }, [awaitingResponse, hasPendingBotMessage, isBotSpeaking, isProcessingImage, error]);

  useEffect(() => () => {
    if (awaitingTimerRef.current) clearTimeout(awaitingTimerRef.current);
  }, []);

  const handleSendText = async (e: FormEvent) => {
    e.preventDefault();
    if (!isConnected) return;
    const trimmed = textInput.trim();
    if (pendingImage) {
      try {
        const dataUrl = await fileToDataUrl(pendingImage.file);
        const base64 = stripDataUrlPrefix(dataUrl);
        sendImage(base64, pendingImage.file.type, dataUrl, trimmed || undefined);
        markAwaitingResponse();
        clearPendingImage();
        setTextInput("");
      } catch {
        setUploadError("Couldn't read image file.");
      }
      return;
    }
    if (!trimmed) return;
    sendText(trimmed);
    markAwaitingResponse();
    setTextInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isConnected && (textInput.trim() || pendingImage)) {
        handleSendText(e as unknown as FormEvent);
      }
    }
  };

  const handleCopyShareLink = useCallback(async () => {
    if (!shareUrl) return;
    const writeLegacy = () => {
      const textarea = document.createElement("textarea");
      textarea.value = shareUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    };
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        writeLegacy();
      }
    } catch {
      writeLegacy();
    }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }, [shareUrl]);

  // Loading state
  if (!config) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <p className="text-muted text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-background lg:flex">
      {/* ── Main area ── */}
      <div ref={mainAreaRef} className="relative h-full lg:flex-1 lg:min-w-0 overflow-hidden">
      {/* ── Floating connection badge — shown only below lg, where the side panel (which hosts the badge) is hidden ── */}
      <div
        className="absolute left-3 z-40 flex items-center gap-2 lg:hidden"
        style={{ top: "max(0.75rem, env(safe-area-inset-top, 0.75rem))" }}
      >
        <ConnectionBadge state={connectionState} />
      </div>

      <div
        className="absolute right-3 z-40 flex items-center gap-2"
        style={{ top: "max(0.75rem, env(safe-area-inset-top, 0.75rem))" }}
      >
        <ThemeToggle />
        <div className="relative" ref={overflowRef}>
          <button
            type="button"
            onClick={() => setShowOverflow(!showOverflow)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-foreground/10 backdrop-blur-sm text-foreground/80 hover:text-foreground hover:bg-foreground/20 transition"
            title="Menu"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.5"/>
              <circle cx="12" cy="12" r="1.5"/>
              <circle cx="12" cy="19" r="1.5"/>
            </svg>
          </button>
          {showOverflow && (
            <div className="absolute right-0 top-11 w-48 rounded-xl border border-border bg-surface/95 backdrop-blur-md shadow-xl z-50 py-1 overflow-hidden">
              <button
                type="button"
                onClick={() => { setShowInfoDrawer(true); setShowOverflow(false); }}
                className="lg:hidden w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-surface-light transition"
              >
                Character info
              </button>
              {IS_DEV && (
                <>
                  <button onClick={() => { setRightPanel(p => p === "memory" ? "chat" : "memory"); setShowOverflow(false); }}
                    className="lg:hidden w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-surface-light transition">
                    {rightPanel === "memory" ? "Chat" : "Memory Map"}
                  </button>
                  <button onClick={() => { setShowSettings(true); setShowOverflow(false); }}
                    className="lg:hidden w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-surface-light transition">
                    Settings
                  </button>
                </>
              )}
              {shareUrl && (
                <button onClick={handleCopyShareLink}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-surface-light transition">
                  {shareCopied ? "Link copied!" : "Copy share link"}
                </button>
              )}
              <div className="border-t border-border my-1" />
              <button onClick={() => { handleDisconnect(); setShowOverflow(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-surface-light transition">
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── 3D Character — left 1/3, bottom-aligned. Hidden when character has no 3D model. ── */}
      {has3DModel && (
        <div
          ref={characterFloatRef}
          className="absolute left-0 bottom-16 w-2/5 h-[50%] lg:h-[70%] z-0"
          style={{ willChange: "transform" }}
        >
          <CharacterViewer
            modelUrl={characterInfo?.modelUrl ?? null}
            previewModelUrl={characterInfo?.modelPreviewUrl ?? null}
            modelStatus={characterInfo?.modelStatus ?? null}
            avatarUrl={characterInfo?.avatar ?? null}
            state={characterState as "idle" | "listening" | "thinking" | "speaking" | "happy"}
            audioLevel={botAudioLevel}
          />
        </div>
      )}

      {/* ── Chat messages + Input overlay ── */}
      <div className="relative z-10 h-full flex flex-col pointer-events-none">
        {/* Scrollable messages — full-width centered when no 3D, right 2/3 otherwise.
            When a 3D model is present we constrain the scroll container to the right
            2/3 (instead of full-width) so the bubbles sit close to the character while
            the left third stays empty — click-drag pointer events there fall through to
            the character canvas below (z-0), letting OrbitControls rotate the model.
            (The character is the left 2/5, so this region overlaps its rightmost edge;
            the model is centered in its canvas, so it stays draggable.) */}
        <div className={`flex-1 overflow-y-auto pt-16 pb-2 px-4 pointer-events-auto ${has3DModel ? "ml-auto w-2/3" : ""}`}>
          {IS_DEV && rightPanel === "memory" && (
            <div className="lg:hidden">
              <MemoryPanel getClient={getClient} />
            </div>
          )}
          <div className={`${IS_DEV && rightPanel === "memory" ? "hidden lg:block" : ""} ${has3DModel ? "" : "max-w-3xl mx-auto"}`}>
            <FullChatLog
              messages={messages as ChatMsg[]}
              messagesEndRef={messagesEndRef}
              lastMessageRef={lastMessageRef}
              isVoiceActive={isVoiceActive}
              isBotSpeaking={isBotSpeaking}
              isProcessingImage={isProcessingImage}
            />
          </div>
        </div>

        {/* Input bar — pinned to bottom */}
        <div
          className="shrink-0 px-3 pt-1 pointer-events-auto"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 1rem))" }}
        >
          <ChatInputForm
            wrapperClassName={has3DModel ? "" : "max-w-3xl mx-auto"}
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
            pendingImage={pendingImage}
            onPickImage={acceptImageFile}
            onRemoveImage={clearPendingImage}
            onPasteImage={acceptImageFile}
            onDropImage={acceptImageFile}
            uploadError={uploadError}
          />
        </div>
      </div>
      </div>
      {/* ── end Main area ── */}

      {/* ── Desktop side panel — always visible at lg+ ── */}
      <div className="hidden lg:flex w-80 shrink-0 h-full flex-col border-l border-border bg-card">
        {/* Panel selector */}
        <div className="flex items-center px-4 py-3 border-b border-border shrink-0">
          {IS_DEV ? (
            <div className="relative flex-1" ref={sidePanelMenuRef}>
              <button
                type="button"
                onClick={() => setSidePanelMenuOpen(v => !v)}
                className="flex items-center gap-2 text-sm font-semibold hover:text-accent-light transition cursor-pointer"
              >
                {activeSidePanel === "character" ? "Character" : activeSidePanel === "memory" ? "Memory Map" : "Settings"}
                <svg className="text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {sidePanelMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-44 rounded-lg border border-border bg-surface-light shadow-xl z-50 py-1 overflow-hidden">
                  {([["character", "Character"], ["memory", "Memory Map"], ["settings", "Settings"]] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => { setActiveSidePanel(value); setSidePanelMenuOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-sm transition ${
                        activeSidePanel === value
                          ? "text-accent-light bg-accent/10"
                          : "text-foreground hover:bg-surface hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="text-sm font-semibold">Character</span>
          )}
          <div className="ml-auto shrink-0 pl-2">
            <ConnectionBadge state={connectionState} />
          </div>
        </div>

        {/* Panel content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {activeSidePanel === "character" && (
            <div className="flex-1 overflow-y-auto py-4">
              <CharacterInfoBlock characterInfo={characterInfo} />
            </div>
          )}
          {activeSidePanel === "memory" && (
            <MemoryPanel getClient={getClient} />
          )}
          {activeSidePanel === "settings" && (
            <SettingsDrawer
              open={true}
              onClose={() => {}}
              settings={settings}
              onChange={setSettings}
              onReconnect={handleReconnect}
              isConnected={isConnected}
              inline
            />
          )}
        </div>
      </div>

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
            className="fixed top-0 right-0 h-full w-[min(100%,20rem)] z-50 border-l border-border bg-card shadow-xl flex flex-col transition-transform duration-200 ease-out translate-x-0"
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
