/** Browser-synthesized call audio (ring, connect, end) — no asset files required. */

let sharedCtx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!sharedCtx) {
    sharedCtx = new AudioContext();
  }
  if (sharedCtx.state === "suspended") void sharedCtx.resume();
  return sharedCtx;
}

function tone(
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  gain = 0.08,
) {
  const ac = ctx();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Classic dual-tone phone ring pattern (plays ~2 cycles). */
export async function playRingtone(cycles = 2): Promise<void> {
  const ac = ctx();
  const now = ac.currentTime;
  for (let i = 0; i < cycles; i++) {
    const t0 = now + i * 1.15;
    // Dual-tone ring
    tone(440, t0, 0.38, "sine", 0.07);
    tone(480, t0, 0.38, "sine", 0.07);
    tone(440, t0 + 0.42, 0.38, "sine", 0.07);
    tone(480, t0 + 0.42, 0.38, "sine", 0.07);
  }
  await new Promise((r) => setTimeout(r, cycles * 1150));
}

export function playCallConnected() {
  const ac = ctx();
  const t = ac.currentTime;
  tone(520, t, 0.12, "sine", 0.06);
  tone(780, t + 0.1, 0.16, "sine", 0.07);
}

export function playCallEnded() {
  const ac = ctx();
  const t = ac.currentTime;
  tone(660, t, 0.1, "sine", 0.05);
  tone(440, t + 0.12, 0.18, "sine", 0.05);
}

export function playSoftTick() {
  const ac = ctx();
  tone(880, ac.currentTime, 0.05, "triangle", 0.035);
}

/** Speak text with the best available English voice; returns when finished. */
export function speakAlice(text: string, onEnd?: () => void): SpeechSynthesisUtterance | null {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd?.();
    return null;
  }
  window.speechSynthesis.cancel();
  const clean = text
    .replace(/[*_`#>/\\]/g, " ")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
  if (!clean) {
    onEnd?.();
    return null;
  }
  const u = new SpeechSynthesisUtterance(clean);
  u.rate = 1.02;
  u.pitch = 1.05;
  u.volume = 1;
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => /en(-|_)?(US|GB|CA|AU)?/i.test(v.lang) && /female|samantha|victoria|karen|moira|zira|google.*us/i.test(v.name)) ||
    voices.find((v) => v.lang.toLowerCase().startsWith("en"));
  if (preferred) u.voice = preferred;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
  return u;
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

export function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function voiceCallSupported(): { speech: boolean; mic: boolean } {
  return {
    speech: typeof window !== "undefined" && !!window.speechSynthesis,
    mic: !!getSpeechRecognitionCtor(),
  };
}
