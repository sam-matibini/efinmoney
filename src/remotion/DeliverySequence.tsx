import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring, Sequence } from "remotion";

/**
 * Cinematic "money flying to your recipient" success sequence.
 * Played once after a transfer is confirmed. Parameterised via inputProps.
 */

export const DELIVERY_DURATION = 165; // 5.5s @30fps
export const DELIVERY_W = 720;
export const DELIVERY_H = 420;

export interface DeliveryProps {
  amount: string;
  currency: string;
  recipientName: string;
  sourceFlag: string;
  targetFlag: string;
}

const P0 = { x: 130, y: 250 };
const P1 = { x: 360, y: 70 };
const P2 = { x: 590, y: 250 };

const bezier = (t: number) => {
  const mt = 1 - t;
  return {
    x: mt * mt * P0.x + 2 * mt * t * P1.x + t * t * P2.x,
    y: mt * mt * P0.y + 2 * mt * t * P1.y + t * t * P2.y,
  };
};

const Node: React.FC<{ x: number; y: number; flag: string; label: string; lit: number }> = ({ x, y, flag, label, lit }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)", textAlign: "center" }}>
    <div
      style={{
        width: 72, height: 72, borderRadius: "50%",
        background: "hsl(var(--card))",
        border: `2px solid hsl(var(--primary) / ${0.3 + lit * 0.7})`,
        boxShadow: `0 0 ${10 + lit * 30}px hsl(var(--primary) / ${0.2 + lit * 0.5})`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34,
      }}
    >
      {flag}
    </div>
    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>{label}</div>
  </div>
);

export const DeliverySequence: React.FC<DeliveryProps> = ({
  amount, currency, recipientName, sourceFlag, targetFlag,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // packet travels frames 30 → 100
  const travelT = interpolate(frame, [30, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pos = bezier(travelT);
  const traveling = frame >= 28 && frame <= 104;

  const recipientLit = interpolate(frame, [96, 112], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const senderLit = interpolate(frame, [10, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // dashed trail draw 0→1 with the packet
  const dash = 700;
  const drawn = interpolate(travelT, [0, 1], [dash, 0]);

  const checkScale = spring({ frame: frame - 102, fps, config: { damping: 12 } });
  const amountCount = Math.round(interpolate(frame, [8, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * 100) / 100;

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(100% 80% at 50% 20%, hsl(var(--primary) / 0.1), transparent 60%), hsl(var(--card))",
        fontFamily: "Inter, system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      <svg width={DELIVERY_W} height={DELIVERY_H} style={{ position: "absolute", inset: 0 }}>
        <path
          d={`M ${P0.x} ${P0.y} Q ${P1.x} ${P1.y} ${P2.x} ${P2.y}`}
          fill="none" stroke="hsl(var(--primary) / 0.25)" strokeWidth={2}
          strokeDasharray={dash} strokeDashoffset={drawn} strokeLinecap="round"
        />
        {traveling && (
          <>
            <circle cx={pos.x} cy={pos.y} r={20} fill="hsl(var(--primary) / 0.25)" />
            <circle cx={pos.x} cy={pos.y} r={11} fill="hsl(var(--primary))" />
            <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize={12} fontWeight={800} fill="white">$</text>
          </>
        )}
      </svg>

      <Node x={P0.x} y={P0.y} flag={sourceFlag} label="You" lit={senderLit} />
      <Node x={P2.x} y={P2.y} flag={targetFlag} label={recipientName.split(" ")[0] || "Recipient"} lit={recipientLit} />

      {/* check badge on recipient when delivered */}
      {frame >= 102 && (
        <div
          style={{
            position: "absolute", left: P2.x + 22, top: P2.y - 30,
            transform: `translate(-50%,-50%) scale(${checkScale})`,
            width: 30, height: 30, borderRadius: "50%", background: "hsl(var(--primary))",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px hsl(var(--primary) / 0.5)",
          }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      {/* headline amount */}
      <div style={{ position: "absolute", top: 24, left: 0, right: 0, textAlign: "center" }}>
        <div
          style={{
            fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase",
            color: "hsl(var(--muted-foreground))", fontWeight: 600,
            opacity: interpolate(frame, [4, 16], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          {frame < 105 ? "Sending" : "Sent successfully"}
        </div>
        <div
          style={{
            fontSize: 40, fontWeight: 800, color: "hsl(var(--foreground))", letterSpacing: -1,
            opacity: interpolate(frame, [6, 18], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          {currency} {amountCount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </div>
      </div>

      {/* delivered banner */}
      <Sequence from={108}>
        <DeliveredBanner recipientName={recipientName} />
      </Sequence>
    </AbsoluteFill>
  );
};

const DeliveredBanner: React.FC<{ recipientName: string }> = ({ recipientName }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 13 } });
  return (
    <div style={{ position: "absolute", bottom: 28, left: 0, right: 0, textAlign: "center" }}>
      <div
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "10px 22px", borderRadius: 999,
          background: "hsl(var(--primary) / 0.12)", border: "1px solid hsl(var(--primary) / 0.4)",
          transform: `scale(${s})`,
        }}
      >
        <span style={{ fontSize: 18 }}>🎉</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "hsl(var(--foreground))" }}>
          Delivered to {recipientName}
        </span>
      </div>
      {/* confetti */}
      {Array.from({ length: 24 }).map((_, i) => {
        const seed = (i * 1103515245 + 12345) % 2147483648;
        const rx = (seed / 2147483648);
        const angle = rx * Math.PI * 2;
        const dist = 60 + rx * 160;
        const colors = ["hsl(var(--primary))", "#fbbf24", "#8b5cf6", "#60a5fa", "#34d399"];
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist - 40;
        const p = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: "50%", bottom: 40,
              width: 7, height: 7, borderRadius: 2, background: colors[i % colors.length],
              transform: `translate(${x * p}px, ${y * p + p * p * 120}px) rotate(${p * 360}deg)`,
              opacity: 1 - p,
            }}
          />
        );
      })}
    </div>
  );
};
