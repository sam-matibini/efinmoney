import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { COUNTRIES, findCountryById } from "@/lib/countries";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import africaHero from "@/assets/landing-africa-hero.jpg";

// Featured corridors — marquee chips only. The searchable picker below is the
// full product list; these just sample breadth (multi-origin + Africa + West).
interface FeaturedCorridor {
  from: string;
  fromCc: string;
  to: string;
  /** Override destination flag / currency when `to` is not in COUNTRIES (e.g. EU, UK). */
  toCc?: string;
  code?: string;
}

const CORRIDORS: FeaturedCorridor[] = [
  // Existing Canada → Africa routes (kept)
  { from: "Canada", fromCc: "ca", to: "Nigeria" },
  { from: "Canada", fromCc: "ca", to: "Ghana" },
  { from: "Canada", fromCc: "ca", to: "Kenya" },
  { from: "Canada", fromCc: "ca", to: "Senegal" },
  { from: "Canada", fromCc: "ca", to: "Zimbabwe" },
  { from: "Canada", fromCc: "ca", to: "Zambia" },
  { from: "Canada", fromCc: "ca", to: "South Africa" },
  { from: "Canada", fromCc: "ca", to: "Uganda" },
  { from: "Canada", fromCc: "ca", to: "Tanzania" },
  // Same destinations, other funded wallets (USD / GBP / EUR)
  { from: "US", fromCc: "us", to: "Nigeria" },
  { from: "US", fromCc: "us", to: "Kenya" },
  { from: "UK", fromCc: "gb", to: "Ghana" },
  { from: "UK", fromCc: "gb", to: "Uganda" },
  { from: "Europe", fromCc: "eu", to: "Senegal" },
  // Non-Africa samples (card / bank rails already in the picker)
  { from: "Canada", fromCc: "ca", to: "United Kingdom", toCc: "gb", code: "GBP" },
  { from: "US", fromCc: "us", to: "European Union", toCc: "eu", code: "EUR" },
];

// Country name → ISO-3166 alpha-2 (lowercase) for flagcdn.com. Flag *emoji*
// don't render on Windows/Chrome, so we use real flag images instead.
const ISO_BY_NAME: Record<string, string> = {
  Algeria: "dz", Angola: "ao", Benin: "bj", Botswana: "bw", "Burkina Faso": "bf",
  Burundi: "bi", Cameroon: "cm", Congo: "cg", "DR Congo": "cd", Egypt: "eg",
  Ethiopia: "et", Gambia: "gm", Ghana: "gh", Guinea: "gn", "Ivory Coast": "ci",
  Kenya: "ke", Liberia: "lr", Madagascar: "mg", Malawi: "mw", Mali: "ml",
  Morocco: "ma", Mozambique: "mz", Namibia: "na", Niger: "ne", Nigeria: "ng",
  Rwanda: "rw", Senegal: "sn", "Sierra Leone": "sl", "South Africa": "za",
  "South Sudan": "ss", Sudan: "sd", Tanzania: "tz", Togo: "tg", Tunisia: "tn",
  Uganda: "ug", Zambia: "zm", Zimbabwe: "zw",
  "United Kingdom": "gb", "European Union": "eu", "United States": "us", Canada: "ca",
};

// A single row in the destination picker.
interface Destination {
  key: string;
  cc: string; // ISO-2 for the flag image (flagcdn)
  title: string;
  subtitle: string;
  code: string; // payout currency — drives routing + the badge
  search: string; // lowercased haystack for the fuzzy filter
}

// Worldwide card-payout corridors (Stripe Visa Direct / Mastercard Send).
// Currency-scoped rather than per-country: USD reaches US + global cards, EUR
// spans the EU-27, GBP is the UK.
const GLOBAL_DESTINATIONS: Destination[] = [
  { key: "USD", cc: "us", title: "International", subtitle: "US & global cards", code: "USD", search: "usd international united states us global america worldwide dollar" },
  { key: "EUR", cc: "eu", title: "European Union", subtitle: "EU-27 · Germany, France & more", code: "EUR", search: "eur euro europe eu germany france spain italy netherlands belgium portugal ireland austria" },
  { key: "GBP", cc: "gb", title: "United Kingdom", subtitle: "Bank transfer", code: "GBP", search: "gbp united kingdom uk britain england pound sterling" },
];

// Every African destination we terminate in, straight from the product's
// canonical country dataset (alphabetised). Adding a country to the Send picker
// surfaces it here automatically.
const AFRICAN_DESTINATIONS: Destination[] = COUNTRIES.filter((c) => c.region === "Africa")
  .slice()
  .sort((a, b) => a.country.localeCompare(b.country))
  .map((c) => ({
    key: c.id,
    cc: ISO_BY_NAME[c.id] ?? "",
    title: c.country,
    subtitle: c.method,
    code: c.code,
    search: `${c.country} ${c.code} ${c.method}`.toLowerCase(),
  }));

const TOTAL_DESTINATIONS = GLOBAL_DESTINATIONS.length + AFRICAN_DESTINATIONS.length;

// Real flag image (flagcdn) — renders identically across every OS/browser.
function Flag({ cc, alt, className = "" }: { cc: string; alt: string; className?: string }) {
  if (!cc) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-white/10 text-[10px] ${className}`}
        aria-hidden
      >
        🌍
      </span>
    );
  }
  return (
    <img
      src={`https://flagcdn.com/w40/${cc}.png`}
      srcSet={`https://flagcdn.com/w80/${cc}.png 2x`}
      alt={alt}
      loading="lazy"
      className={`shrink-0 rounded-full object-cover ring-1 ring-white/25 ${className}`}
    />
  );
}

// Send a prospect into sign-up, remembering the corridor they picked so the
// Send flow can pre-select the destination after they authenticate.
function corridorHref(currencyCode: string | undefined): string {
  if (!currencyCode) return "/auth";
  return `/auth?redirect=${encodeURIComponent(`/send?to=${currencyCode}`)}`;
}

interface GlobalCorridorsProps {
  videoSrc?: string;
}

export default function GlobalCorridors({ videoSrc }: GlobalCorridorsProps) {
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(videoSrc);
  const [showVideo, setShowVideo] = useState(!!videoSrc);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const featured = useMemo(
    () =>
      CORRIDORS.map((c) => {
        const info = findCountryById(c.to);
        return {
          from: c.from,
          fromCc: c.fromCc,
          to: c.to,
          toCc: c.toCc ?? ISO_BY_NAME[c.to] ?? "",
          code: c.code ?? info?.code,
        };
      }),
    [],
  );

  useEffect(() => {
    if (videoSrc || prefersReducedMotion) {
      if (videoSrc) {
        setResolvedSrc(videoSrc);
        setShowVideo(true);
      }
      return;
    }

    let cancelled = false;
    const loadVideo = async () => {
      const { data } = await supabase.storage
        .from("assets")
        .createSignedUrl("hero-background.mp4", 60 * 60 * 24);
      if (!cancelled && data?.signedUrl) {
        setResolvedSrc(data.signedUrl);
        setShowVideo(true);
      }
    };

    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(() => void loadVideo(), { timeout: 3000 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }

    const timer = setTimeout(() => void loadVideo(), 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [videoSrc, prefersReducedMotion]);

  const handleSelect = (dest: Destination) => {
    setPickerOpen(false);
    navigate(corridorHref(dest.code));
  };

  const renderRow = (d: Destination) => (
    <CommandItem
      key={d.key}
      value={d.search}
      onSelect={() => handleSelect(d)}
      className="group mx-1 my-0.5 cursor-pointer rounded-xl px-3 py-2.5 text-white data-[selected=true]:bg-[#FFD700]/15 data-[selected=true]:text-white"
    >
      <Flag cc={d.cc} alt={d.title} className="mr-3 h-6 w-6" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] font-semibold leading-tight">{d.title}</span>
        <span className="truncate text-[12px] text-white/45">{d.subtitle}</span>
      </span>
      <span className="ml-auto shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white/55 transition-colors group-data-[selected=true]:border-[#FFD700]/40 group-data-[selected=true]:text-[#FFD700]">
        {d.code}
      </span>
    </CommandItem>
  );

  return (
    <section
      className="relative w-full overflow-hidden flex flex-col items-center justify-center"
      style={{ minHeight: "90vh", backgroundColor: "#050210" }}
    >
      {/* Static poster — instant first paint */}
      <img
        src={africaHero}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0"
        fetchPriority="high"
      />

      {/* Video enhancement — loaded after idle, never blocks interaction */}
      {showVideo && resolvedSrc && (
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
          className="mx-auto mb-10 text-white/70"
          style={{
            fontSize: "clamp(15px, 1.6vw, 19px)",
            maxWidth: 580,
            lineHeight: 1.65,
          }}
        >
          Global transfers, across the board — instant payouts at market-beating rates.
        </p>

        {/* Searchable destination picker — the full list, so nobody turns away */}
        <div className="mx-auto mb-10 w-full max-w-md">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Search all destinations"
                className="group flex w-full items-center gap-3 rounded-full border px-5 py-3.5 text-left transition-all hover:border-[#FFD700]/70 hover:bg-white/[0.12] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD700]/60"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  borderColor: "rgba(255,215,0,0.35)",
                  backdropFilter: "blur(10px)",
                  boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
                }}
              >
                <Search className="h-[18px] w-[18px] shrink-0 text-[#FFD700]" />
                <span className="flex-1 text-[15px] font-medium text-white/80">
                  Find your country
                  <span className="hidden text-white/45 sm:inline">
                    {" "}— search all {TOTAL_DESTINATIONS} destinations
                  </span>
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-white/40 transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="center"
              sideOffset={10}
              className="w-[min(92vw,26rem)] overflow-hidden rounded-2xl border border-[#FFD700]/20 p-0 shadow-[0_24px_70px_rgba(0,0,0,0.65)]"
              style={{ background: "rgba(11,5,28,0.97)", backdropFilter: "blur(20px)" }}
            >
              <Command
                className="bg-transparent text-white [&_[cmdk-input-wrapper]]:border-white/10"
                filter={(value, search) =>
                  value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                }
              >
                <CommandInput
                  placeholder="Type a country or currency…"
                  className="text-white placeholder:text-white/40"
                />
                <CommandList className="max-h-[340px] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15">
                  <CommandEmpty className="text-white/50">
                    No destination found.
                  </CommandEmpty>
                  <CommandGroup
                    heading="Worldwide"
                    className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-[#FFD700]/70"
                  >
                    {GLOBAL_DESTINATIONS.map(renderRow)}
                  </CommandGroup>
                  <CommandSeparator className="mx-3 my-1 bg-white/10" />
                  <CommandGroup
                    heading={`Africa · ${AFRICAN_DESTINATIONS.length}`}
                    className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-white/40"
                  >
                    {AFRICAN_DESTINATIONS.map(renderRow)}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Featured corridors — sample only; full list is in the picker above */}
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          Popular routes · from CAD, USD, GBP &amp; EUR
        </p>
        <div className="flex flex-wrap gap-2.5 justify-center mb-12 max-w-3xl mx-auto">
          {featured.map((c) => (
            <button
              key={`${c.from}-${c.to}`}
              type="button"
              onClick={() => navigate(corridorHref(c.code))}
              className="flex items-center gap-2.5 rounded-full py-1.5 pl-2 pr-4 border transition-all hover:-translate-y-0.5 hover:border-[#FFD700]/70 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD700]/60"
              style={{
                background: "rgba(255,255,255,0.13)",
                borderColor: "rgba(255,215,0,0.4)",
                backdropFilter: "blur(8px)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
              }}
            >
              <span className="flex items-center -space-x-1.5">
                <Flag cc={c.fromCc} alt={c.from} className="h-5 w-5" />
                <Flag cc={c.toCc} alt={c.to} className="h-5 w-5" />
              </span>
              <span className="text-[13px] font-semibold text-white whitespace-nowrap">
                {c.from} → {c.to}
              </span>
            </button>
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
