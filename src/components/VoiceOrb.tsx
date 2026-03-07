"use client";

import { ConnectionState } from "@estuary-ai/sdk";

interface VoiceOrbProps {
  connectionState: ConnectionState;
  isVoiceActive: boolean;
  isBotSpeaking: boolean;
  isMuted: boolean;
  sttText: string;
}

export default function VoiceOrb({
  connectionState,
  isVoiceActive,
  isBotSpeaking,
  isMuted,
  sttText,
}: VoiceOrbProps) {
  const isConnected = connectionState === ConnectionState.Connected;
  const isConnecting =
    connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Reconnecting;

  const orbSize = isBotSpeaking ? "w-32 h-32" : isVoiceActive ? "w-28 h-28" : "w-24 h-24";

  const getGradient = () => {
    if (!isConnected) return "from-zinc-700 to-zinc-800";
    if (isBotSpeaking) return "from-violet-500 via-fuchsia-500 to-pink-500";
    if (isVoiceActive && !isMuted) return "from-indigo-500 via-blue-500 to-cyan-500";
    if (isMuted) return "from-amber-600 to-orange-600";
    return "from-indigo-600 to-violet-600";
  };

  const getLabel = () => {
    if (isConnecting) return "Connecting...";
    if (!isConnected) return "Disconnected";
    if (isBotSpeaking) return "Speaking...";
    if (sttText) return "Listening...";
    if (isVoiceActive && !isMuted) return "Listening";
    if (isMuted) return "Muted";
    return "Ready";
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex items-center justify-center">
        {/* Outer pulse rings */}
        {(isBotSpeaking || (isVoiceActive && sttText)) && (
          <>
            <div
              className={`absolute rounded-full bg-gradient-to-r ${getGradient()} opacity-20 animate-pulse-ring`}
              style={{ width: "160%", height: "160%" }}
            />
            <div
              className={`absolute rounded-full bg-gradient-to-r ${getGradient()} opacity-10 animate-pulse-ring`}
              style={{
                width: "200%",
                height: "200%",
                animationDelay: "0.5s",
              }}
            />
          </>
        )}

        {/* Spinning ring for connecting */}
        {isConnecting && (
          <div
            className="absolute w-36 h-36 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin-slow"
          />
        )}

        {/* Main orb */}
        <div
          className={`
            ${orbSize} rounded-full bg-gradient-to-br ${getGradient()}
            shadow-lg shadow-indigo-500/20
            transition-all duration-500 ease-out
            ${isBotSpeaking ? "animate-breathe" : ""}
            ${isConnecting ? "animate-pulse" : ""}
          `}
          style={{
            boxShadow: isConnected
              ? isBotSpeaking
                ? "0 0 60px rgba(167, 139, 250, 0.4)"
                : isVoiceActive
                ? "0 0 40px rgba(99, 102, 241, 0.3)"
                : "0 0 20px rgba(99, 102, 241, 0.2)"
              : "none",
          }}
        >
          {/* Inner shine */}
          <div className="w-full h-full rounded-full bg-gradient-to-t from-transparent to-white/10" />
        </div>
      </div>

      {/* Status label */}
      <span className="text-sm font-medium text-muted tracking-wide uppercase">
        {getLabel()}
      </span>

      {/* Live STT text */}
      {sttText && (
        <p className="text-sm text-foreground/70 italic max-w-xs text-center animate-fade-in-up">
          &ldquo;{sttText}&rdquo;
        </p>
      )}
    </div>
  );
}
