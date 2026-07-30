import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Loader2, MapPin } from "lucide-react";

export interface PlaceDetails {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string; // ISO 3166-1 alpha-2
}

interface PhotonFeature {
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    postcode?: string;
    countrycode?: string;
    country?: string;
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

interface PhotonAddressInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onPlace: (place: PlaceDetails) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  className?: string;
}

// Hard cap to stay inside Photon's 1 req/sec fair-use policy.
const MIN_INTERVAL_MS = 1100;
const TYPING_DEBOUNCE_MS = 350;

export function PhotonAddressInput({
  id,
  value,
  onChange,
  onPlace,
  placeholder,
  required,
  autoComplete,
  className,
}: PhotonAddressInputProps) {
  const [results, setResults] = useState<PhotonFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastFetchAtRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Debounced fetch on value change.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const query = value.trim();
    if (query.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      const now = Date.now();
      const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastFetchAtRef.current));
      if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
      }
      lastFetchAtRef.current = Date.now();
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const url = new URL("https://photon.komoot.io/api/");
        url.searchParams.set("q", query);
        url.searchParams.set("limit", "5");
        url.searchParams.set("lang", "en");
        const res = await fetch(url.toString(), { signal: ctrl.signal });
        if (!res.ok) throw new Error(`Photon ${res.status}`);
        const data = (await res.json()) as PhotonResponse;
        setResults(data.features ?? []);
        setOpen(true);
        setActiveIndex(-1);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, TYPING_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value]);

  const choose = (f: PhotonFeature) => {
    const p = f.properties;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ").trim() || p.name || "";
    const place: PlaceDetails = {
      street,
      city: p.city || "",
      state: p.state || "",
      postalCode: p.postcode || "",
      countryCode: (p.countrycode || "").toUpperCase(),
    };
    onChange(place.street);
    onPlace(place);
    setOpen(false);
    setResults([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      choose(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={id ? `${id}-listbox` : undefined}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-12 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-base ring-offset-background placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
      />
      {loading && (
        <Loader2 className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 animate-spin" />
      )}
      {open && results.length > 0 && (
        <ul
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-neutral-200 bg-white shadow-lg"
        >
          {results.map((f, i) => {
            const p = f.properties;
            const main =
              [p.housenumber, p.street].filter(Boolean).join(" ").trim() || p.name || "";
            const sub = [p.city, p.state, p.country].filter(Boolean).join(", ");
            return (
              <li
                key={i}
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(f);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  "flex cursor-pointer items-start gap-2 px-3 py-2 text-sm",
                  i === activeIndex ? "bg-primary/5 text-neutral-900" : "text-neutral-700"
                )}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{main}</span>
                  {sub && <span className="block truncate text-xs text-neutral-500">{sub}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
