import { useEffect } from "react";
import { ChevronDown, ChevronUp, Mic, MicOff, PhoneOff, Loader2 } from "lucide-react";
import { ALICE_ACCENT, ALICE_BRAND, ALICE_BRAND_MID, ALICE_BRAND_SOFT } from "@/components/alice/aliceAdvisorTheme";
import { useAliceVoiceCall, type AliceCallPhase, type AliceTurnRecorder } from "@/hooks/useAliceVoiceCall";
import { cn } from "@/lib/utils";
import type { AliceClientTools } from "@/lib/aliceNavigation";

type Props = {
  active: boolean;
  context: "user" | "admin";
  onTurn?: AliceTurnRecorder;
  onEnd: () => void;
  onOpenMessages?: () => void;
  clientTools?: AliceClientTools;
  /** Small bar so the page behind stays visible (e.g. after Alice opens a page). */
  compact?: boolean;
  onToggleCompact?: () => void;
};

function statusLabel(phase: AliceCallPhase, muted: boolean): string {
  if (muted && phase === "listening") return "Muted — tap mic to speak";
  switch (phase) {
    case "ringing":
      return "Calling Alice…";
    case "connecting":
      return "Connecting…";
    case "greeting":
      return "Alice is speaking…";
    case "listening":
      return "Listening — speak now";
    case "thinking":
      return "Alice is thinking…";
    case "speaking":
      return "Alice is speaking…";
    case "ended":
      return "Call ended";
    case "unsupported":
      return "Voice unavailable";
    default:
      return "Ready";
  }
}

/** Full-screen-in-panel live voice call with the ElevenLabs Alice agent. */
export default function AliceLiveCall({
  active,
  context,
  onTurn,
  onEnd,
  onOpenMessages,
  clientTools,
  compact,
  onToggleCompact,
}: Props) {
  const { phase, transcript, interim, lastReply, error, muted, startCall, hangUp, toggleMute } =
    useAliceVoiceCall(context, active, onTurn, clientTools);

  useEffect(() => {
    if (active && phase === "idle") {
      void startCall();
    }
  }, [active, phase, startCall]);

  const end = () => {
    hangUp();
    onEnd();
  };

  const live = ["ringing", "connecting", "greeting", "listening", "thinking", "speaking"].includes(phase);

  if (compact) {
    return (
      <div
        className="flex items-center gap-3 px-3 py-2.5 text-white"
        style={{ background: `linear-gradient(120deg, ${ALICE_BRAND} 0%, ${ALICE_BRAND_MID} 100%)` }}
      >
        <button
          type="button"
          onClick={onToggleCompact}
          aria-label="Expand call"
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
        >
          <span
            className={cn(
              "relative h-10 w-10 shrink-0 rounded-full overflow-hidden ring-2 ring-white/30",
              phase === "listening" && "ring-amber-300/80",
            )}
          >
            <img src="/alice.png" alt="Alice" className="h-full w-full object-cover object-top" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[11px] text-white/70">
              {(phase === "thinking" || phase === "ringing") && <Loader2 className="h-3 w-3 animate-spin" />}
              {statusLabel(phase, muted)}
            </span>
            <span className="block text-sm leading-snug line-clamp-2">
              {lastReply || interim || transcript || "Alice · AI Expert"}
            </span>
          </span>
          <ChevronUp className="h-4 w-4 shrink-0 text-white/70" />
        </button>
        <button
          type="button"
          onClick={toggleMute}
          disabled={!live}
          aria-label={muted ? "Unmute" : "Mute"}
          className={cn(
            "h-10 w-10 shrink-0 rounded-full flex items-center justify-center",
            muted ? "bg-amber-300 text-slate-900" : "bg-white/15 hover:bg-white/25",
            !live && "opacity-40",
          )}
        >
          {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={end}
          aria-label="End call"
          className="h-10 w-10 shrink-0 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col flex-1 min-h-0 text-white"
      style={{
        background: `linear-gradient(165deg, ${ALICE_BRAND} 0%, ${ALICE_BRAND_SOFT} 45%, ${ALICE_BRAND_MID} 100%)`,
      }}
    >
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 text-center relative overflow-hidden">
        {onToggleCompact && (
          <button
            type="button"
            onClick={onToggleCompact}
            aria-label="Minimise call"
            className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center z-10"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        )}
        {/* Ambient pulse while live */}
        {live && (
          <span
            className="absolute h-56 w-56 rounded-full opacity-30"
            style={{
              background: "radial-gradient(circle, rgba(255,255,255,0.35) 0%, transparent 70%)",
              animation: "alice-live-pulse 2.2s ease-in-out infinite",
            }}
            aria-hidden
          />
        )}

        <div className="relative mb-5">
          <div
            className={cn(
              "h-28 w-28 rounded-full overflow-hidden ring-4 ring-white/25 shadow-xl bg-white/10",
              phase === "listening" && "ring-amber-300/70",
              phase === "speaking" && "ring-white/50",
            )}
          >
            <img
              src="/alice.png"
              alt="Alice"
              className="h-full w-full object-cover object-top"
            />
          </div>
          {(phase === "listening" || phase === "ringing") && (
            <span
              className="absolute inset-0 rounded-full animate-ping opacity-40"
              style={{ background: ALICE_ACCENT }}
              aria-hidden
            />
          )}
        </div>

        <p className="text-lg font-semibold tracking-tight">Alice · AI Expert</p>
        <p className="text-sm text-white/75 mt-1 flex items-center gap-1.5 justify-center min-h-[1.25rem]">
          {(phase === "thinking" || phase === "ringing") && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          )}
          {statusLabel(phase, muted)}
        </p>

        <div className="mt-5 w-full max-w-sm space-y-2 min-h-[4.5rem]">
          {(interim || transcript) && (
            <div className="rounded-2xl bg-white/10 px-3.5 py-2.5 text-sm text-left">
              <p className="text-[10px] uppercase tracking-wide text-white/50 mb-0.5">You</p>
              <p className="text-white/95">{interim || transcript}</p>
            </div>
          )}
          {lastReply && phase !== "ringing" && (
            <div className="rounded-2xl bg-black/20 px-3.5 py-2.5 text-sm text-left">
              <p className="text-[10px] uppercase tracking-wide text-white/50 mb-0.5">Alice</p>
              <p className="text-white/95 line-clamp-4">{lastReply}</p>
            </div>
          )}
          {error && (
            <p className="text-xs text-amber-200 bg-amber-500/15 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-center gap-5 px-5 pb-6 pt-2">
        <button
          type="button"
          onClick={toggleMute}
          disabled={!live}
          aria-label={muted ? "Unmute" : "Mute"}
          className={cn(
            "h-14 w-14 rounded-full flex items-center justify-center transition-colors",
            muted ? "text-[color:var(--ab)]" : "bg-white/15 text-white hover:bg-white/25",
            !live && "opacity-40",
          )}
          style={
            muted
              ? { background: ALICE_ACCENT, ["--ab" as string]: ALICE_BRAND }
              : undefined
          }
        >
          {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </button>

        <button
          type="button"
          onClick={end}
          aria-label="End call"
          className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-900/30 transition-colors"
        >
          <PhoneOff className="h-7 w-7" />
        </button>

        {onOpenMessages && (
          <button
            type="button"
            onClick={() => {
              hangUp();
              onOpenMessages();
            }}
            className="h-14 w-14 rounded-full bg-white/15 text-xs font-medium text-white hover:bg-white/25"
          >
            Chat
          </button>
        )}
      </div>

      <style>{`
        @keyframes alice-live-pulse {
          0%, 100% { transform: scale(0.9); opacity: 0.25; }
          50% { transform: scale(1.15); opacity: 0.45; }
        }
      `}</style>
    </div>
  );
}
