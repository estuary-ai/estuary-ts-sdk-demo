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
  apiKey: string;
  characterId: string;
  playerId: string;
}

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
  const [error, setError] = useState<string | null>(null);

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
    async (config: EstuaryConfig) => {
      cleanup();
      setError(null);
      setMessages([]);

      const client = new EstuaryClient({
        ...config,
        autoReconnect: true,
        maxReconnectAttempts: 5,
        debug: true,
        voiceTransport: "auto",
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
        setMessages((prev) => {
          const existing = prev.findIndex(
            (m) => m.id === response.messageId && m.role === "bot"
          );
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = {
              ...updated[existing],
              text: response.text,
              isFinal: response.isFinal,
            };
            return updated;
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
        setIsBotSpeaking(true);
      });

      client.on("audioPlaybackComplete", () => {
        setIsBotSpeaking(false);
      });

      client.on("interrupt", () => {
        setIsBotSpeaking(false);
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

  const stopVoice = useCallback(() => {
    clientRef.current?.stopVoice();
    setIsVoiceActive(false);
    setIsMuted(false);
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

  return {
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
  };
}
