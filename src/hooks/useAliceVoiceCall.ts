import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation, type VoiceConversation } from "@elevenlabs/client";
import { playCallConnected, playCallEnded, playRingtone } from "@/lib/aliceCallAudio";
import { fetchAliceAgentSession, type AliceContext } from "@/lib/aliceAgent";
import { delegateClientTools, type AliceClientTools } from "@/lib/aliceNavigation";

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

/** Maps getUserMedia / SDK failures to something a customer can act on. */
function describeCallError(raw: unknown): { message: string; micProblem: boolean } {
  const name = (raw as { name?: string })?.name || "";
  const text = raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "";
  const probe = `${name} ${text}`;
  if (/NotFound|device not found|DevicesNotFound/i.test(probe)) {
    return { message: "No microphone found. Plug in or enable a microphone, or tap Chat to type instead.", micProblem: true };
  }
  if (/NotAllowed|permission|denied/i.test(probe)) {
    return { message: "Microphone access is blocked. Allow it in your browser's site settings, or tap Chat.", micProblem: true };
  }
  if (/NotReadable|in use|TrackStart/i.test(probe)) {
    return { message: "Your microphone is being used by another app. Close it and try again.", micProblem: true };
  }
  return { message: text || "Couldn't connect the call.", micProblem: false };
}

/**
 * Live voice call with the ElevenLabs Alice agent over WebRTC: ringtone → agent
 * greeting → natural back-and-forth (agent handles turn-taking and interruptions).
 * Each finished user/agent utterance is passed to `onTurn` so it lands in the chat history.
 */
export function useAliceVoiceCall(
  context: AliceContext,
  enabled: boolean,
  onTurn?: AliceTurnRecorder,
  clientTools?: AliceClientTools,
) {
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
  const toolsRef = useRef(clientTools);

  useEffect(() => {
    onTurnRef.current = onTurn;
  }, [onTurn]);

  useEffect(() => {
    toolsRef.current = clientTools;
  }, [clientTools]);

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
        clientTools: delegateClientTools(toolsRef),
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
        onError: (message, ctx) => {
          setError(describeCallError(ctx ?? message).message || "Something went wrong on the call.");
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
      const { message, micProblem } = describeCallError(e);
      setError(message);
      setPhase(micProblem ? "unsupported" : "ended");
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
