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
      style={{ minHeight: 600, backgroundColor: "#050210" }}
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


      {/* Dark overlay for legibility */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 bg-gradient-to-b from-[#050210]/70 via-[#050210]/45 to-[#050210]/80"
      />

      {/* Content */}
      <div className="relative z-10 text-center px-6 py-20 max-w-[860px] w-full">
        <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-[#FFD700] mb-4">
          Live Transfer Routes
        </p>

        <h2
          className="font-extrabold text-white m-0 mb-5"
          style={{ fontSize: "clamp(28px, 5vw, 52px)", lineHeight: 1.1 }}
        >
          Send money across borders,{" "}
          <span style={{ color: "#FFD700" }}>instantly.</span>
        </h2>

        <p
          className="mx-auto mb-12 text-white/65"
          style={{
            fontSize: "clamp(15px, 2vw, 18px)",
            maxWidth: 560,
            lineHeight: 1.6,
          }}
        >
          Real-time transfers from Canada to 5 African corridors — with the best
          rates on the continent.
        </p>

        <div className="flex flex-wrap gap-3 justify-center mb-12">
          {CORRIDORS.map((c) => (
            <div
              key={c.to}
              className="flex items-center gap-2 rounded-full px-[18px] py-2 border backdrop-blur-md"
              style={{
                background: "rgba(255,255,255,0.07)",
                borderColor: "rgba(255,215,0,0.25)",
              }}
            >
              <span className="text-lg" aria-hidden="true">{c.flag}</span>
              <span className="text-sm font-semibold text-white/90 whitespace-nowrap">
                {c.from} → {c.to}
              </span>
            </div>
          ))}
        </div>

        <Link
          to="/auth"
          className="inline-block font-bold text-base px-9 py-[14px] rounded-full transition-opacity hover:opacity-90"
          style={{
            background: "#FFD700",
            color: "#1A0A3C",
            letterSpacing: "0.02em",
          }}
        >
          Get eFinMoney →
        </Link>
      </div>
    </section>
  );
}
