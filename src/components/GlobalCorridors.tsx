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

// Featured corridors — the marquee routes shown as chips. The full, searchable
// list below is derived live from the same COUNTRIES source the Send flow uses,
// so marketing can never drift from what the product actually supports.
const CORRIDORS = [
  { to: "Nigeria" },
  { to: "Ghana" },
  { to: "Kenya" },
  { to: "Senegal" },
  { to: "Zimbabwe" },
  { to: "Zambia" },
  { to: "South Africa" },
  { to: "Uganda" },
  { to: "Tanzania" },
];

// A single row in the destination picker.
interface Destination {
  key: string;
  flag: string;
  title: string;
  subtitle: string;
  code: string; // payout currency — drives routing + the badge
  search: string; // lowercased haystack for the fuzzy filter
}

// Worldwide card-payout corridors (Stripe Visa Direct / Mastercard Send).
// Currency-scoped rather than per-country: USD reaches US + global cards, EUR
// spans the EU-27, GBP is the UK.
const GLOBAL_DESTINATIONS: Destination[] = [
  { key: "USD", flag: "🌎", title: "International", subtitle: "US + global", code: "USD", search: "usd international united states us global america worldwide dollar" },
  { key: "EUR", flag: "🇪🇺", title: "EU-27", subtitle: "Germany, France & more", code: "EUR", search: "eur euro europe eu germany france spain italy netherlands belgium portugal ireland austria" },
  { key: "GBP", flag: "🇬🇧", title: "United Kingdom", subtitle: "Bank transfer", code: "GBP", search: "gbp united kingdom uk britain england pound sterling" },
];

// Every African destination we terminate in, straight from the product's
// canonical country dataset (alphabetised). Adding a country to the Send picker
// surfaces it here automatically.
const AFRICAN_DESTINATIONS: Destination[] = COUNTRIES.filter((c) => c.region === "Africa")
  .slice()
  .sort((a, b) => a.country.localeCompare(b.country))
  .map((c) => ({
    key: c.id,
    flag: c.flag,
    title: c.country,
    subtitle: c.method,
    code: c.code,
    search: `${c.country} ${c.code} ${c.method}`.toLowerCase(),
  }));

const TOTAL_DESTINATIONS = GLOBAL_DESTINATIONS.length + AFRICAN_DESTINATIONS.length;

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
        return { to: c.to, flag: info?.flag ?? "🏳️", code: info?.code };
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
      <span className="mr-3 text-xl" aria-hidden="true">
        {d.flag}
      </span>
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
          Real-time transfers from Canada to {AFRICAN_DESTINATIONS.length} African
          destinations — plus USD, EUR &amp; GBP payouts worldwide, at the best rates.
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

        {/* Featured corridors */}
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          Most popular routes
        </p>
        <div className="flex flex-wrap gap-2.5 justify-center mb-12 max-w-2xl mx-auto">
          {featured.map((c) => (
            <button
              key={c.to}
              type="button"
              onClick={() => navigate(corridorHref(c.code))}
              className="flex items-center gap-2 rounded-full px-4 py-2 border transition-all hover:-translate-y-0.5 hover:border-[#FFD700]/70 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD700]/60"
              style={{
                background: "rgba(255,255,255,0.15)",
                borderColor: "rgba(255,215,0,0.4)",
                backdropFilter: "blur(8px)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
              }}
            >
              <span className="text-base drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" aria-hidden="true">
                {c.flag}
              </span>
              <span className="text-[13px] font-semibold text-white whitespace-nowrap">
                Canada → {c.to}
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
