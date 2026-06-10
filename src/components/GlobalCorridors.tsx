import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const CORRIDORS = [
  { from: "Canada", to: "Nigeria", flag: "🇳🇬" },
  { from: "Canada", to: "Ghana", flag: "🇬🇭" },
  { from: "Canada", to: "Kenya", flag: "🇰🇪" },
  { from: "Canada", to: "Senegal", flag: "🇸🇳" },
  { from: "Canada", to: "Zimbabwe", flag: "🇿🇼" },
];

interface GlobalCorridorsProps {
  videoSrc?: string;
}

export default function GlobalCorridors({ videoSrc }: GlobalCorridorsProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(videoSrc);

  useEffect(() => {
    if (videoSrc) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .storage
        .from("assets")
        .createSignedUrl("hero-background.mp4", 60 * 60 * 24);
      if (!cancelled && data?.signedUrl) setResolvedSrc(data.signedUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [videoSrc]);

  return (
    <section
      className="relative w-full overflow-hidden flex flex-col items-center justify-center"
      style={{ minHeight: "90vh", backgroundColor: "#050210" }}
    >
      {/* Video background */}
      {resolvedSrc && (
        <video
          key={resolvedSrc}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0"
        >
          <source src={resolvedSrc} type="video/mp4" />
        </video>
      )}

      {/* Cinematic vignette + edge blend with neighbouring sections */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(5,2,16,0.25) 0%, rgba(5,2,16,0.65) 60%, rgba(5,2,16,0.92) 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-32 z-0"
        style={{ background: "linear-gradient(to bottom, #050210, transparent)" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-32 z-0"
        style={{ background: "linear-gradient(to top, #050210, transparent)" }}
      />

      {/* Content */}
      <div className="relative z-10 text-center px-6 py-24 max-w-[920px] w-full">
        <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full border border-[#FFD700]/30 bg-[#FFD700]/5 backdrop-blur-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#FFD700] opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FFD700]" />
          </span>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#FFD700] m-0">
            Live Transfer Routes
          </p>
        </div>

        <h2
          className="font-extrabold text-white m-0 mb-6 tracking-tight"
          style={{ fontSize: "clamp(32px, 5.5vw, 64px)", lineHeight: 1.05 }}
        >
          Send money across borders,{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            instantly.
          </span>
        </h2>

        <p
          className="mx-auto mb-12 text-white/70"
          style={{
            fontSize: "clamp(15px, 1.6vw, 19px)",
            maxWidth: 580,
            lineHeight: 1.65,
          }}
        >
          Real-time transfers from Canada to 5 African corridors — with the best
          rates on the continent.
        </p>

        <div className="flex flex-wrap gap-2.5 justify-center mb-12 max-w-2xl mx-auto">
          {CORRIDORS.map((c) => (
            <div
              key={c.to}
              className="flex items-center gap-2 rounded-full px-4 py-2 border transition-all hover:border-[#FFD700]/70 hover:bg-white/20"
              style={{
                background: "rgba(255,255,255,0.15)",
                borderColor: "rgba(255,215,0,0.4)",
                backdropFilter: "blur(8px)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
              }}
            >
              <span className="text-base drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" aria-hidden="true">{c.flag}</span>
              <span className="text-[13px] font-semibold text-white whitespace-nowrap">
                {c.from} → {c.to}
              </span>
            </div>
          ))}
        </div>


        <Link
          to="/auth"
          className="inline-block font-bold text-base px-9 py-[14px] rounded-full transition-all hover:scale-105 hover:shadow-[0_10px_40px_rgba(255,215,0,0.4)]"
          style={{
            background: "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)",
            color: "#1A0A3C",
            letterSpacing: "0.02em",
            boxShadow: "0 8px 30px rgba(255,215,0,0.25)",
          }}
        >
          Get eFinMoney →
        </Link>
      </div>
    </section>
  );
}
