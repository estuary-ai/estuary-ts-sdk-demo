"use client";

import { useEffect, useRef } from "react";
import type { EstuarySettings } from "@/hooks/useEstuary";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: EstuarySettings;
  onChange: (settings: EstuarySettings) => void;
  onReconnect: () => void;
  isConnected: boolean;
  inline?: boolean;
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 w-9 h-5 rounded-full shrink-0 transition-colors ${
          checked ? "bg-accent" : "bg-surface-light border border-border"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium group-hover:text-foreground transition">{label}</p>
        {description && (
          <p className="text-[11px] text-muted leading-relaxed mt-0.5">{description}</p>
        )}
      </div>
    </label>
  );
}

function Select({
  value,
  onChange,
  label,
  description,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  description?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-[11px] text-muted leading-relaxed mt-0.5">{description}</p>
        )}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-surface-light border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition appearance-none cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  label,
  description,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-[11px] text-muted leading-relaxed mt-0.5">{description}</p>
        )}
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full px-3 py-2 rounded-lg bg-surface-light border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
      />
    </div>
  );
}

export default function SettingsDrawer({
  open,
  onClose,
  settings,
  onChange,
  onReconnect,
  isConnected,
  inline,
}: SettingsDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (inline || !open) return;
    const handleClick = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [inline, open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (inline || !open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [inline, open, onClose]);

  const update = <K extends keyof EstuarySettings>(key: K, value: EstuarySettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  const settingsBody = (
    <>
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {/* Voice section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-semibold text-muted uppercase tracking-wider">Voice</h3>

          <Select
            label="Voice Transport"
            description="How audio is streamed. WebRTC (LiveKit) has lower latency, WebSocket is more compatible."
            value={settings.voiceTransport}
            onChange={(v) => update("voiceTransport", v as EstuarySettings["voiceTransport"])}
            options={[
              { value: "auto", label: "Auto (prefer LiveKit)" },
              { value: "livekit", label: "LiveKit (WebRTC)" },
              { value: "websocket", label: "WebSocket" },
            ]}
          />

          <Toggle
            label="Auto-interrupt on speech"
            description="Automatically stop bot audio when you start speaking (barge-in)."
            checked={settings.autoInterruptOnSpeech}
            onChange={(v) => update("autoInterruptOnSpeech", v)}
          />

          <Toggle
            label="Suppress mic during playback"
            description="Mute your mic while the bot is speaking. Disables barge-in but prevents echo on devices without hardware AEC."
            checked={settings.suppressMicDuringPlayback}
            onChange={(v) => update("suppressMicDuringPlayback", v)}
          />

          <Select
            label="Audio Sample Rate"
            description="Higher rates give better quality but use more bandwidth."
            value={String(settings.audioSampleRate)}
            onChange={(v) => update("audioSampleRate", Number(v))}
            options={[
              { value: "16000", label: "16 kHz (default)" },
              { value: "24000", label: "24 kHz" },
              { value: "44100", label: "44.1 kHz (CD quality)" },
              { value: "48000", label: "48 kHz (studio)" },
            ]}
          />
        </section>

        <div className="h-px bg-border" />

        {/* Memory section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-semibold text-muted uppercase tracking-wider">Memory</h3>

          <Toggle
            label="Real-time memory"
            description="Extract and store memories after each response. Enables the memory panel to update live."
            checked={settings.realtimeMemory}
            onChange={(v) => update("realtimeMemory", v)}
          />
        </section>

        <div className="h-px bg-border" />

        {/* Connection section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-semibold text-muted uppercase tracking-wider">Connection</h3>

          <Toggle
            label="Auto-reconnect"
            description="Automatically reconnect when the connection drops."
            checked={settings.autoReconnect}
            onChange={(v) => update("autoReconnect", v)}
          />

          <NumberInput
            label="Max reconnect attempts"
            description="How many times to retry before giving up."
            value={settings.maxReconnectAttempts}
            onChange={(v) => update("maxReconnectAttempts", v)}
            min={1}
            max={20}
            step={1}
          />
        </section>

        <div className="h-px bg-border" />

        {/* Developer section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-semibold text-muted uppercase tracking-wider">Developer</h3>

          <Toggle
            label="Debug logging"
            description="Log SDK events and audio frames to the browser console."
            checked={settings.debug}
            onChange={(v) => update("debug", v)}
          />
        </section>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-5 py-4 border-t border-border space-y-2">
        <p className="text-[10px] text-muted leading-relaxed">
          Some settings require a reconnect to take effect.
        </p>
        <button
          onClick={onReconnect}
          disabled={!isConnected}
          className="w-full py-2.5 rounded bg-accent text-white font-medium text-sm hover:bg-accent-light transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reconnect with new settings
        </button>
      </div>
    </>
  );

  if (inline) return settingsBody;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-50 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed top-0 right-0 h-full w-96 max-w-[90vw] bg-background border-l border-border z-50 flex flex-col transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-light">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <h2 className="text-sm font-semibold">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition p-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {settingsBody}
      </div>
    </>
  );
}
