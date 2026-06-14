import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring } from "remotion";

/**
 * Looping hero animation for the International send tab.
 * A glowing eFinMoney hub beams money out to country nodes orbiting around it.
 * Rendered as DOM/SVG via @remotion/player, so brand CSS variables work.
 */

export const HERO_DURATION = 180; // frames @ 30fps = 6s loop
export const HERO_W = 960;
export const HERO_H = 360;

const DESTINATIONS = [
  { flag: "🇳🇬", label: "Nigeria", angle: -20 },
  { flag: "🇰🇪", label: "Kenya", angle: 35 },
  { flag: "🇬🇭", label: "Ghana", angle: 90 },
  { flag: "🇿🇦", label: "S. Africa", angle: 145 },
  { flag: "🇺🇬", label: "Uganda", angle: 200 },
  { flag: "🇹🇿", label: "Tanzania", angle: 255 },
  { flag: "🇨🇦", label: "Canada", angle: 310 },
];

export const MoneyGlobe: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cx = HERO_W / 2;
  const cy = HERO_H / 2;
  const rx = 300;
  const ry = 130;

  const ringRotation = (frame / HERO_DURATION) * 360;
  const hubPulse = 1 + 0.06 * Math.sin((frame / fps) * 3);

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(120% 120% at 50% 30%, hsl(var(--primary) / 0.12), transparent 60%), linear-gradient(160deg, hsl(var(--background)), hsl(var(--muted) / 0.4))",
        fontFamily: "Inter, system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* faint starfield dots */}
      {Array.from({ length: 40 }).map((_, i) => {
        const seed = (i * 9301 + 49297) % 233280;
        const x = (seed / 233280) * HERO_W;
        const y = ((seed * 7) % 233280) / 233280 * HERO_H;
        const tw = 0.3 + 0.7 * Math.abs(Math.sin((frame / fps) * 1.5 + i));
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: x, top: y, width: 2, height: 2,
              borderRadius: "50%", background: "hsl(var(--primary))", opacity: tw * 0.4,
            }}
          />
        );
      })}

      <svg width={HERO_W} height={HERO_H} style={{ position: "absolute", inset: 0 }}>
        {/* orbit ellipse */}
        <g transform={`rotate(${ringRotation * 0.15} ${cx} ${cy})`}>
          <ellipse
            cx={cx} cy={cy} rx={rx} ry={ry}
            fill="none" stroke="hsl(var(--primary) / 0.25)" strokeWidth={1.5}
            strokeDasharray="4 8"
          />
        </g>
        <ellipse cx={cx} cy={cy} rx={rx * 0.62} ry={ry * 0.62} fill="none" stroke="hsl(var(--primary) / 0.12)" strokeWidth={1} />

        {/* beams + flying money to each destination */}
        {DESTINATIONS.map((d, i) => {
          const a = d.angle + ringRotation;
          const dest = { x: cx + rx * Math.cos((a * Math.PI) / 180), y: cy + ry * Math.sin((a * Math.PI) / 180) };
          // staggered packet progress
          const cycle = HERO_DURATION;
          const offset = (i / DESTINATIONS.length) * cycle;
          const t = ((frame + offset) % cycle) / cycle;
          const px = interpolate(t, [0, 1], [cx, dest.x]);
          const py = interpolate(t, [0, 1], [cy, dest.y]);
          const packetOpacity = t < 0.85 ? interpolate(t, [0, 0.1, 0.8, 0.85], [0, 1, 1, 0]) : 0;
          return (
            <g key={d.label}>
              <line
                x1={cx} y1={cy} x2={dest.x} y2={dest.y}
                stroke="hsl(var(--primary) / 0.18)" strokeWidth={1}
              />
              <circle cx={px} cy={py} r={5} fill="hsl(var(--primary))" opacity={packetOpacity}>
              </circle>
              <circle cx={px} cy={py} r={9} fill="hsl(var(--primary) / 0.3)" opacity={packetOpacity} />
            </g>
          );
        })}
      </svg>

      {/* destination nodes (DOM for emoji crispness) */}
      {DESTINATIONS.map((d, i) => {
        const a = d.angle + ringRotation;
        const x = cx + rx * Math.cos((a * Math.PI) / 180);
        const y = cy + ry * Math.sin((a * Math.PI) / 180);
        const appear = spring({ frame: frame - i * 4, fps, config: { damping: 14 } });
        return (
          <div
            key={d.label}
            style={{
              position: "absolute", left: x, top: y, transform: `translate(-50%, -50%) scale(${appear})`,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            }}
          >
            <div
              style={{
                width: 38, height: 38, borderRadius: "50%",
                background: "hsl(var(--card))", border: "1px solid hsl(var(--primary) / 0.4)",
                boxShadow: "0 4px 16px hsl(var(--primary) / 0.25)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
              }}
            >
              {d.flag}
            </div>
            <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>{d.label}</span>
          </div>
        );
      })}

      {/* central hub */}
      <div
        style={{
          position: "absolute", left: cx, top: cy, transform: `translate(-50%, -50%) scale(${hubPulse})`,
          width: 88, height: 88, borderRadius: "50%",
          background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent, var(--primary))))",
          boxShadow: "0 0 0 8px hsl(var(--primary) / 0.12), 0 0 40px hsl(var(--primary) / 0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "white", fontSize: 34, fontWeight: 800,
        }}
      >
        ₵
      </div>

      {/* tagline */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 18, textAlign: "center" }}>
        <div
          style={{
            opacity: interpolate(frame, [10, 30], [0, 1], { extrapolateRight: "clamp" }),
            transform: `translateY(${interpolate(frame, [10, 30], [10, 0], { extrapolateRight: "clamp" })}px)`,
            fontSize: 22, fontWeight: 800, color: "hsl(var(--foreground))", letterSpacing: -0.4,
          }}
        >
          Send money to <span style={{ color: "hsl(var(--primary))" }}>150+ countries</span>
        </div>
        <div
          style={{
            opacity: interpolate(frame, [22, 42], [0, 1], { extrapolateRight: "clamp" }),
            fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 2,
          }}
        >
          Real-time rates · Bank, mobile money &amp; cards · Arrives in minutes
        </div>
      </div>
    </AbsoluteFill>
  );
};
