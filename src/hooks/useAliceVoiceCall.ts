import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation, type VoiceConversation } from "@elevenlabs/client";
import { playCallConnected, playCallEnded, playRingtone } from "@/lib/aliceCallAudio";
import { fetchAliceAgentSession, type AliceContext } from "@/lib/aliceAgent";

export type AliceCallPhase =
  | "idle"
  | "ringing"
  | "connecting"
  | "greeting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ended"
  | "unsupported";

export type AliceTurnRecorder = (role: "user" | "assistant", text: string) => void | Promise<void>;

function micSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Live voice call with the ElevenLabs Alice agent over WebRTC: ringtone → agent
 * greeting → natural back-and-forth (agent handles turn-taking and interruptions).
 * Each finished user/agent utterance is passed to `onTurn` so it lands in the chat history.
 */
export function useAliceVoiceCall(context: AliceContext, enabled: boolean, onTurn?: AliceTurnRecorder) {
  const [phase, setPhase] = useState<AliceCallPhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const convRef = useRef<VoiceConversation | null>(null);
  const activeRef = useRef(false);
  const greetedRef = useRef(false);
  const onTurnRef = useRef(onTurn);

  useEffect(() => {
    onTurnRef.current = onTurn;
  }, [onTurn]);

  const hangUp = useCallback(() => {
    const wasLive = activeRef.current;
    activeRef.current = false;
    const conv = convRef.current;
    convRef.current = null;
    if (conv) void conv.endSession().catch(() => {});
    if (wasLive) playCallEnded();
    setPhase("ended");
    setInterim("");
  }, []);

  const startCall = useCallback(async () => {
    if (!micSupported()) {
      setPhase("unsupported");
      setError("This browser can't access a microphone. Try Chrome, Edge, or Safari.");
      return;
    }
    activeRef.current = true;
    greetedRef.current = false;
    setError(null);
    setTranscript("");
    setInterim("");
    setLastReply("");
    setMuted(false);
    setPhase("ringing");

    try {
      const [creds] = await Promise.all([
        fetchAliceAgentSession(context, "voice"),
        playRingtone(1).catch(() => {}),
      ]);
      if (!activeRef.current) return;
      if (!creds.conversationToken) throw new Error("Alice is unavailable right now.");
      setPhase("connecting");

      const conv = await Conversation.startSession({
        conversationToken: creds.conversationToken,
        connectionType: "webrtc",
        textOnly: false,
        userId: creds.userId,
        dynamicVariables: creds.dynamicVariables,
        onConnect: () => {
          playCallConnected();
          setPhase("greeting");
        },
        onModeChange: ({ mode }) => {
          if (!activeRef.current) return;
          if (mode === "speaking") {
            setPhase(greetedRef.current ? "speaking" : "greeting");
          } else {
            greetedRef.current = true;
            setPhase("listening");
          }
        },
        onMessage: ({ message, role }) => {
          const text = message?.trim();
          if (!text || !activeRef.current) return;
          if (role === "user") {
            setTranscript(text);
            setInterim("");
            setPhase("thinking");
            void onTurnRef.current?.("user", text);
          } else {
            setLastReply(text);
            void onTurnRef.current?.("assistant", text);
          }
        },
        onError: (message) => {
          setError(message || "Something went wrong on the call.");
        },
        onDisconnect: () => {
          if (!activeRef.current) return;
          activeRef.current = false;
          convRef.current = null;
          playCallEnded();
          setPhase("ended");
        },
      });

      if (!activeRef.current) {
        void conv.endSession().catch(() => {});
        return;
      }
      convRef.current = conv;
    } catch (e) {
      if (!activeRef.current) return;
      activeRef.current = false;
      const msg = e instanceof Error ? e.message : "Couldn't connect the call.";
      const denied = /permission|notallowed|denied/i.test(msg);
      setError(denied ? "Microphone permission is required to talk to Alice." : msg);
      setPhase(denied ? "unsupported" : "ended");
    }
  }, [context]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      convRef.current?.setMicMuted(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled && activeRef.current) {
      hangUp();
    }
    if (!enabled) {
      setPhase("idle");
      setTranscript("");
      setInterim("");
      setLastReply("");
      setError(null);
    }
  }, [enabled, hangUp]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      const conv = convRef.current;
      convRef.current = null;
      if (conv) void conv.endSession().catch(() => {});
    };
  }, []);

  return {
    phase,
    transcript,
    interim,
    lastReply,
    error,
    muted,
    startCall,
    hangUp,
    toggleMute,
    supported: { speech: true, mic: micSupported() },
  };
}
