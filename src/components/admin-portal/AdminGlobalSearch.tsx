import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchAdminCatalog, type AdminSearchHit } from "@/lib/adminSearchCatalog";

type Props = {
  className?: string;
  placeholder?: string;
  compact?: boolean;
  onNavigate?: () => void;
};

export default function AdminGlobalSearch({
  className,
  placeholder = "Search pages, tabs, partners…",
  compact = false,
  onNavigate,
}: Props) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const hits = useMemo(() => searchAdminCatalog(query), [query]);

  const go = (hit: AdminSearchHit) => {
    navigate(hit.to);
    setQuery("");
    setOpen(false);
    onNavigate?.();
  };

  const goUsers = () => {
    const q = query.trim();
    navigate(q ? `/admin/users?q=${encodeURIComponent(q)}` : "/admin/users");
    setQuery("");
    setOpen(false);
    onNavigate?.();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const input = rootRef.current?.querySelector("input");
        input?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const showUsers = query.trim().length >= 2;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const extra = showUsers ? 1 : 0;
    const total = hits.length + extra;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (total ? (i + 1) % total : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (total ? (i - 1 + total) % total : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active < hits.length && hits[active]) go(hits[active]);
      else if (showUsers) goUsers();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Search className={cn(
        "absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground",
        compact ? "w-3.5 h-3.5 left-2.5" : "w-4 h-4",
      )} />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={cn(
          compact
            ? "pl-8 h-8 text-xs bg-muted/50 border-transparent focus-visible:bg-background"
            : "pl-9 h-9 bg-muted/50 border-transparent focus-visible:bg-background",
        )}
        autoComplete="off"
        aria-label="Search admin panel"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border bg-popover text-popover-foreground shadow-lg overflow-hidden">
          <div className="max-h-80 overflow-y-auto py-1">
            {hits.length === 0 && !showUsers && (
              <div className="px-3 py-6 text-sm text-center text-muted-foreground">No matching page or tab</div>
            )}
            {hits.map((hit, i) => (
              <button
                key={hit.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(hit)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-3",
                  i === active ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
                )}
              >
                <span className="font-medium truncate">{hit.label}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">{hit.group}</span>
              </button>
            ))}
            {showUsers && (
              <button
                type="button"
                onMouseEnter={() => setActive(hits.length)}
                onClick={goUsers}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm border-t",
                  active === hits.length ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
                )}
              >
                Search users for “{query.trim()}”
              </button>
            )}
          </div>
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t bg-muted/40">
            Enter to open · Ctrl/⌘ K to focus
          </div>
        </div>
      )}
    </div>
  );
}
