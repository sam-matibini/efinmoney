import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSpeechRecognitionCtor,
  playCallConnected,
  playCallEnded,
  playRingtone,
  playSoftTick,
  speakAlice,
  stopSpeaking,
  voiceCallSupported,
  type SpeechRecognitionLike,
} from "@/lib/aliceCallAudio";

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

type SendFn = (text: string) => Promise<string | null | void>;

/**
 * Interactive voice call with Alice: ringtone → spoken greeting → listen →
 * alice-chat reply spoken aloud → listen again.
 */
export function useAliceVoiceCall(send: SendFn, enabled: boolean) {
  const [phase, setPhase] = useState<AliceCallPhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const phaseRef = useRef<AliceCallPhase>("idle");
  const sendRef = useRef(send);
  const listenRef = useRef<() => void>(() => {});

  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const stopRecognition = useCallback(() => {
    try {
      recogRef.current?.abort();
    } catch {
      /* ignore */
    }
    recogRef.current = null;
  }, []);

  const hangUp = useCallback(() => {
    const wasLive = activeRef.current;
    activeRef.current = false;
    stopRecognition();
    stopSpeaking();
    if (wasLive) playCallEnded();
    setPhase("ended");
    setInterim("");
  }, [stopRecognition]);

  const handleUtterance = useCallback(
    async (text: string) => {
      if (!activeRef.current) return;
      stopRecognition();
      setPhase("thinking");
      setError(null);
      try {
        const reply = await sendRef.current(text);
        if (!activeRef.current) return;
        const spoken =
          (typeof reply === "string" && reply.trim()) ||
          "I didn't catch a reply just now. Could you say that again?";
        const clean = spoken.replace(/^⚠️\s*/, "");
        setLastReply(clean);
        setPhase("speaking");
        speakAlice(clean, () => {
          if (!activeRef.current) return;
          listenRef.current();
        });
      } catch (e) {
        if (!activeRef.current) return;
        const msg = e instanceof Error ? e.message : "Something went wrong on the call.";
        setError(msg);
        setPhase("speaking");
        speakAlice("Sorry, I hit a snag. Please try again.", () => {
          if (activeRef.current) listenRef.current();
        });
      }
    },
    [stopRecognition],
  );

  const listen = useCallback(() => {
    if (!activeRef.current) return;
    if (mutedRef.current) {
      setPhase("listening");
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setPhase("unsupported");
      setError("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    stopRecognition();
    const recog = new Ctor();
    recog.continuous = false;
    recog.interimResults = true;
    recog.lang = "en-US";
    recog.maxAlternatives = 1;
    recogRef.current = recog;
    setPhase("listening");
    setInterim("");

    recog.onresult = (ev) => {
      let finalText = "";
      let interimText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const piece = ev.results[i][0]?.transcript ?? "";
        if (ev.results[i].isFinal) finalText += piece;
        else interimText += piece;
      }
      if (interimText) setInterim(interimText);
      if (finalText.trim()) {
        setTranscript(finalText.trim());
        setInterim("");
        void handleUtterance(finalText.trim());
      }
    };
    recog.onerror = (ev) => {
      if (!activeRef.current) return;
      if (ev.error === "aborted") return;
      if (ev.error === "no-speech") {
        setTimeout(() => {
          if (activeRef.current && !mutedRef.current && phaseRef.current === "listening") {
            listenRef.current();
          }
        }, 280);
        return;
      }
      if (ev.error === "not-allowed") {
        setError("Microphone permission is required to talk to Alice.");
        setPhase("unsupported");
        return;
      }
      setError(`Mic error: ${ev.error}`);
    };
    recog.onend = () => {
      if (!activeRef.current || mutedRef.current) return;
      if (phaseRef.current === "listening") {
        setTimeout(() => {
          if (activeRef.current && phaseRef.current === "listening" && !mutedRef.current) {
            listenRef.current();
          }
        }, 200);
      }
    };

    try {
      recog.start();
      playSoftTick();
    } catch {
      setTimeout(() => {
        if (activeRef.current) {
          try {
            recog.start();
          } catch {
            /* ignore */
          }
        }
      }, 300);
    }
  }, [handleUtterance, stopRecognition]);

  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  const startCall = useCallback(async () => {
    const support = voiceCallSupported();
    if (!support.speech && !support.mic) {
      setPhase("unsupported");
      setError("This browser can't run a live voice call. Try Chrome or Edge.");
      return;
    }
    activeRef.current = true;
    setError(null);
    setTranscript("");
    setInterim("");
    setLastReply("");
    setMuted(false);
    mutedRef.current = false;
    setPhase("ringing");
    try {
      await playRingtone(2);
    } catch {
      /* autoplay may block until gesture — started from a click */
    }
    if (!activeRef.current) return;
    setPhase("connecting");
    playCallConnected();
    if (!activeRef.current) return;
    setPhase("greeting");
    const greeting =
      "Hi, this is Alice, your eFinMoney AI expert. I'm on the line — how can I help you today?";
    setLastReply(greeting);
    speakAlice(greeting, () => {
      if (!activeRef.current) return;
      if (!support.mic) {
        setError("I can speak, but this browser can't hear you. Type in Messages instead.");
        setPhase("unsupported");
        return;
      }
      listenRef.current();
    });
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (next) {
        stopRecognition();
      } else if (
        activeRef.current &&
        phaseRef.current !== "speaking" &&
        phaseRef.current !== "thinking" &&
        phaseRef.current !== "ringing" &&
        phaseRef.current !== "greeting"
      ) {
        setTimeout(() => listenRef.current(), 50);
      }
      return next;
    });
  }, [stopRecognition]);

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
      stopRecognition();
      stopSpeaking();
    };
  }, [stopRecognition]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.getVoices();
    const onVoices = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", onVoices);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", onVoices);
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
    supported: voiceCallSupported(),
  };
}
