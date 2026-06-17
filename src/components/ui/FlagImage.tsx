import { Globe2 } from "lucide-react";
import efinIcon from "@/assets/efin-icon.png";
import { normalizeCountryCode } from "@/lib/flags";
import { WORLD_CURRENCY_MAP } from "@/lib/worldCurrencies";

const SIZES = {
  xs: { box: "h-3.5 w-3.5", icon: "h-2 w-2" },
  sm: { box: "h-4 w-4", icon: "h-2.5 w-2.5" },
  md: { box: "h-5 w-5", icon: "h-3 w-3" },
} as const;

type Size = keyof typeof SIZES;

const FlagImg = ({
  cc,
  alt,
  size = "sm",
  className = "",
}: {
  cc: string;
  alt: string;
  size?: Size;
  className?: string;
}) => (
  <img
    src={`https://flagcdn.com/w40/${cc}.png`}
    srcSet={`https://flagcdn.com/w80/${cc}.png 2x`}
    alt={alt}
    loading="lazy"
    className={`${SIZES[size].box} shrink-0 rounded-full object-cover ring-1 ring-border ${className}`}
  />
);

const GlobeFallback = ({ size = "sm", className = "" }: { size?: Size; className?: string }) => (
  <span
    className={`${SIZES[size].box} inline-flex shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border ${className}`}
    aria-hidden
  >
    <Globe2 className={`${SIZES[size].icon} text-muted-foreground`} />
  </span>
);

export const CurrencyFlag = ({
  code,
  size = "sm",
  className = "",
}: {
  code?: string | null;
  size?: Size;
  className?: string;
}) => {
  const cc = code ? WORLD_CURRENCY_MAP[code.toUpperCase()]?.cc : null;
  if (!cc) return <GlobeFallback size={size} className={className} />;
  return <FlagImg cc={cc} alt={code || ""} size={size} className={className} />;
};

export const CountryFlag = ({
  country,
  size = "sm",
  className = "",
}: {
  country?: string | null;
  size?: Size;
  className?: string;
}) => {
  const cc = normalizeCountryCode(country);
  if (!cc) return <GlobeFallback size={size} className={className} />;
  return <FlagImg cc={cc} alt={country || ""} size={size} className={className} />;
};

export const BrandFlag = ({ size = "sm", className = "" }: { size?: Size; className?: string }) => (
  <img
    src={efinIcon}
    alt="eFinMoney"
    loading="lazy"
    className={`${SIZES[size].box} shrink-0 rounded-full object-cover ring-1 ring-border bg-background ${className}`}
  />
);
