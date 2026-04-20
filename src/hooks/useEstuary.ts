"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EstuaryClient,
  ConnectionState,
  type SessionInfo,
  type BotResponse,
  type SttResponse,
} from "@estuary-ai/sdk";

export interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface EstuaryConfig {
  serverUrl: string;
  apiKey?: string;
  sessionToken?: string;
  characterId: string;
  playerId: string;
}

export interface EstuarySettings {
  voiceTransport: "auto" | "websocket" | "livekit";
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  realtimeMemory: boolean;
  autoInterruptOnSpeech: boolean;
  suppressMicDuringPlayback: boolean;
  audioSampleRate: number;
  debug: boolean;
}

export const DEFAULT_SETTINGS: EstuarySettings = {
  voiceTransport: "auto",
  autoReconnect: true,
  maxReconnectAttempts: 5,
  realtimeMemory: false,
  autoInterruptOnSpeech: true,
  suppressMicDuringPlayback: false,
  audioSampleRate: 16000,
  debug: true,
};

export function useEstuary() {
  const clientRef = useRef<EstuaryClient | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  );
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sttText, setSttText] = useState("");
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [botAudioLevel, setBotAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lastSttTextRef = useRef<string>("");
  const speakingGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current.removeAllListeners();
      clientRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const connect = useCallback(
    async (config: EstuaryConfig, settings: EstuarySettings = DEFAULT_SETTINGS) => {
      cleanup();
      setError(null);
      setMessages([]);

      const client = new EstuaryClient({
        ...config,
        voiceTransport: settings.voiceTransport,
        autoReconnect: settings.autoReconnect,
        maxReconnectAttempts: settings.maxReconnectAttempts,
        realtimeMemory: settings.realtimeMemory,
        autoInterruptOnSpeech: settings.autoInterruptOnSpeech,
        suppressMicDuringPlayback: settings.suppressMicDuringPlayback,
        audioSampleRate: settings.audioSampleRate,
        debug: settings.debug,
      });

      clientRef.current = client;

      client.on("connectionStateChanged", (state) => {
        setConnectionState(state);
      });

      client.on("connected", (s) => {
        setSession(s);
      });

      client.on("disconnected", () => {
        setSession(null);
        setIsVoiceActive(false);
        setIsMuted(false);
        setIsBotSpeaking(false);
      });

      client.on("botResponse", (response: BotResponse) => {
        // Reset STT dedup so user can repeat the same phrase after bot responds
        if (response.isFinal) {
          lastSttTextRef.current = "";
        }
        setMessages((prev) => {
          const existing = prev.findIndex(
            (m) => m.id === response.messageId && m.role === "bot"
          );
          if (existing >= 0) {
            const updated = [...prev];
            // For streaming: accumulate text from non-final chunks, replace on final
            const newText = response.isFinal
              ? response.text
              : response.tokenStream
                ? updated[existing].text + response.text
                : updated[existing].text + response.text;
            updated[existing] = {
              ...updated[existing],
              text: newText,
              isFinal: response.isFinal,
            };
            return updated;
          }
          // Skip creating a bubble for empty chunks (including empty final messages)
          if (!response.text) {
            return prev;
          }
          return [
            ...prev,
            {
              id: response.messageId,
              role: "bot",
              text: response.text,
              timestamp: Date.now(),
              isFinal: response.isFinal,
            },
          ];
        });
      });

      client.on("sttResponse", (response: SttResponse) => {
        if (response.isFinal) {
          if (response.text.trim()) {
            // Deduplicate using ref to avoid React state batching race condition
            if (lastSttTextRef.current === response.text) {
              setSttText("");
              return;
            }
            lastSttTextRef.current = response.text;
            setMessages((prev) => [
              ...prev,
              {
                id: `user-${Date.now()}`,
                role: "user",
                text: response.text,
                timestamp: Date.now(),
                isFinal: true,
              },
            ]);
          }
          setSttText("");
        } else {
          setSttText(response.text);
        }
      });

      client.on("audioPlaybackStarted", () => {
        // Cancel any pending grace timer from a previous utterance
        if (speakingGraceTimerRef.current) {
          clearTimeout(speakingGraceTimerRef.current);
          speakingGraceTimerRef.current = null;
        }
        setIsBotSpeaking(true);
      });

      client.on("audioPlaybackComplete", () => {
        // Grace period: keep isBotSpeaking true for 500ms to cover
        // audio still playing from the WebRTC jitter buffer
        speakingGraceTimerRef.current = setTimeout(() => {
          speakingGraceTimerRef.current = null;
          setIsBotSpeaking(false);
          setBotAudioLevel(0);
        }, 500);
      });

      client.on("interrupt", () => {
        // Interrupt kills animation immediately (no grace period)
        if (speakingGraceTimerRef.current) {
          clearTimeout(speakingGraceTimerRef.current);
          speakingGraceTimerRef.current = null;
        }
        setIsBotSpeaking(false);
        setBotAudioLevel(0);
      });

      client.on("error", (err) => {
        setError(err.message);
        setTimeout(() => setError(null), 5000);
      });

      client.on("authError", (msg) => {
        setError(`Auth failed: ${msg}`);
      });

      try {
        await client.connect();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connection failed");
        throw err;
      }
    },
    [cleanup]
  );

  const disconnect = useCallback(() => {
    cleanup();
    setConnectionState(ConnectionState.Disconnected);
    setSession(null);
    setIsVoiceActive(false);
    setIsMuted(false);
    setIsBotSpeaking(false);
  }, [cleanup]);

  const sendText = useCallback((text: string) => {
    if (!clientRef.current?.isConnected) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        text,
        timestamp: Date.now(),
        isFinal: true,
      },
    ]);
    clientRef.current.sendText(text);
  }, []);

  const startVoice = useCallback(async () => {
    if (!clientRef.current?.isConnected) return;
    try {
      await clientRef.current.startVoice();
      setIsVoiceActive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice failed");
    }
  }, []);

  const stopVoice = useCallback(async () => {
    await clientRef.current?.stopVoice();
    setIsVoiceActive(false);
    setIsMuted(false);
    setIsBotSpeaking(false);
    setSttText("");
  }, []);

  const toggleMute = useCallback(() => {
    if (!clientRef.current?.isVoiceActive) return;
    clientRef.current.toggleMute();
    setIsMuted(clientRef.current.isMuted);
  }, []);

  const interruptBot = useCallback(() => {
    clientRef.current?.interrupt();
    setIsBotSpeaking(false);
  }, []);

  /** Update suppressMicDuringPlayback on the live client (no reconnect needed) */
  const setSuppressMicDuringPlayback = useCallback((enabled: boolean) => {
    if (clientRef.current) {
      clientRef.current.suppressMicDuringPlayback = enabled;
    }
  }, []);

  const getClient = useCallback(() => clientRef.current, []);

  return {
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
  };
}
