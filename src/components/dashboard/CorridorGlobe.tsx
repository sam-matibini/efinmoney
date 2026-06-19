import { memo } from "react";
import { Link } from "react-router-dom";
import { Send } from "lucide-react";
import WireframeDottedGlobe from "@/components/ui/wireframe-dotted-globe";

const countryLabel = (cc: string) => {
  const labels: Record<string, string> = {
    us: "United States",
    ca: "Canada",
    ng: "Nigeria",
    ke: "Kenya",
    gh: "Ghana",
    ug: "Uganda",
    tz: "Tanzania",
    zm: "Zambia",
    za: "South Africa",
    gb: "United Kingdom",
  };
  return labels[cc] ?? cc.toUpperCase();
};

type Props = {
  /** Lowercase ISO-2 codes from the user's actual transfer history only. */
  countries: string[];
};

const CorridorGlobeInner = ({ countries }: Props) => {
  const nodes = countries.slice(0, 6);
  const hasCorridors = nodes.length > 0;

  return (
    <div className="corridor-globe relative flex h-[260px] w-[260px] flex-col items-center justify-center">
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_42%,hsl(var(--primary)/0.2),transparent_72%)]" />

      <svg
        className="corridor-orbit-ring pointer-events-none absolute left-1/2 top-[18px] h-[220px] w-[220px] -translate-x-1/2"
        viewBox="0 0 220 220"
        aria-hidden
      >
        <ellipse
          cx="110"
          cy="110"
          rx="104"
          ry="40"
          fill="none"
          stroke="hsl(var(--primary) / 0.12)"
          strokeWidth="1"
        />
        <ellipse
          cx="110"
          cy="110"
          rx="104"
          ry="40"
          fill="none"
          stroke="hsl(var(--primary) / 0.35)"
          strokeWidth="1.25"
          strokeDasharray="4 8"
        />
      </svg>

      <div className="relative flex h-[210px] w-[210px] items-center justify-center">
        <WireframeDottedGlobe
          width={210}
          height={210}
          highlightCountries={nodes}
          compact
          interactive
          className="relative z-[2]"
        />

        <Link
          to="/send"
          className="group absolute bottom-1 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-[0_4px_20px_hsl(var(--primary)/0.45)] ring-2 ring-card transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_28px_hsl(var(--primary)/0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Send money internationally"
        >
          <Send className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          Send
        </Link>
      </div>

      {hasCorridors ? (
        <div className="relative z-[3] mt-1 flex items-center justify-center pl-2">
          {nodes.map((cc, i) => (
            <div
              key={cc}
              className="corridor-flag-chip group relative -ml-2 first:ml-0"
              style={{
                animationDelay: `${i * 0.35}s`,
                zIndex: nodes.length - i,
              }}
              title={countryLabel(cc)}
            >
              <div
                className="relative h-9 w-9 overflow-hidden rounded-full bg-gradient-to-br from-primary/30 via-card to-[hsl(var(--accent-amber)/0.35)] p-[2px] shadow-[0_4px_14px_hsl(var(--primary)/0.25)] transition-transform duration-200 group-hover:-translate-y-1 group-hover:scale-110"
                style={{ animation: `corridor-flag-pop 0.45s ease-out ${i * 0.08}s both` }}
              >
                <img
                  src={`https://flagcdn.com/w80/${cc}.png`}
                  srcSet={`https://flagcdn.com/w160/${cc}.png 2x`}
                  alt={countryLabel(cc)}
                  loading="lazy"
                  className="h-full w-full rounded-full object-cover ring-1 ring-white/40"
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 max-w-[210px] text-center text-[10px] leading-snug text-muted-foreground">
          Your corridors appear here after your first send
        </p>
      )}
    </div>
  );
};

const CorridorGlobe = memo(CorridorGlobeInner);
CorridorGlobe.displayName = "CorridorGlobe";

export default CorridorGlobe;
