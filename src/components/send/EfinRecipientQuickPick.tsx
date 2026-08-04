import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, User, AlertCircle, Clock, Share2 } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface QuickPickRecipient {
  user_id: string;
  full_name: string | null;
  efin_tag: string | null;
  email: string | null;
  avatar_url: string | null;
  account_number?: string | null;
}

interface SearchRow {
  user_id: string;
  full_name: string | null;
  efin_tag: string | null;
  avatar_url: string | null;
  email_masked: string | null;
  account_number: string | null;
}

interface RecentRow {
  user_id: string;
  full_name: string | null;
  efin_tag: string | null;
  avatar_url: string | null;
  email: string | null;
  account_number: string | null;
  last_sent_at: string;
}

interface Props {
  onSelect: (recipient: QuickPickRecipient) => void;
  isAlreadyAdded: (userId: string) => boolean;
}

const initials = (r: { full_name: string | null; efin_tag: string | null; email: string | null }) => {
  const src = r.full_name || r.efin_tag || r.email || "?";
  return src
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
};

const Avatar = ({ url, label, size = "md" }: { url: string | null; label: string; size?: "sm" | "md" }) => {
  const cls = size === "sm" ? "w-9 h-9 text-xs" : "w-10 h-10 text-sm";
  return (
    <div className={`${cls} rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 font-medium overflow-hidden`}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : label || <User className="w-4 h-4" />}
    </div>
  );
};

const EfinRecipientQuickPick = ({ onSelect, isAlreadyAdded }: Props) => {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [finding, setFinding] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounce the type-ahead query
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Close the suggestion list on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data: recents = [] } = useQuery({
    queryKey: ["efin-recent-recipients", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("recent_efin_recipients");
      if (error) throw error;
      return (data ?? []) as RecentRow[];
    },
  });

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: ["efin-search-recipients", debounced],
    enabled: debounced.replace(/^@/, "").length >= 3,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_efin_recipients", { p_query: debounced });
      if (error) throw error;
      return (data ?? []) as SearchRow[];
    },
  });

  const pick = (r: QuickPickRecipient) => {
    if (r.user_id === user?.id) {
      toast.error("That's you!");
      return;
    }
    if (isAlreadyAdded(r.user_id)) {
      toast.info("Already in your list");
      return;
    }
    onSelect(r);
    setQuery("");
    setDebounced("");
    setOpen(false);
    setNotFound(false);
  };

  // Exact lookup fallback (pasted email / @tag / account number)
  const handleFind = async () => {
    const q = query.trim();
    if (q.length < 3) {
      toast.error("Enter an email, @tag, or account number (min 3 chars)");
      return;
    }
    setFinding(true);
    setNotFound(false);
    try {
      const { data, error } = await supabase.rpc("lookup_efin_recipient", { p_query: q });
      if (error) throw error;
      const row = (data ?? [])[0] as QuickPickRecipient | undefined;
      if (!row) {
        setNotFound(true);
        return;
      }
      pick(row);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setFinding(false);
    }
  };

  const invite = async () => {
    const text = "Join me on eFinMoney — instant, free transfers in-network.";
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: "eFinMoney", text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast.success("Invite link copied");
      }
    } catch {
      /* user dismissed the share sheet */
    }
  };

  return (
    <div className="space-y-3">
      {/* Recent / frequent recipients */}
      {recents.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="w-3.5 h-3.5" aria-hidden /> Recent recipients
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {recents.map((r) => {
              const added = isAlreadyAdded(r.user_id);
              return (
                <button
                  key={r.user_id}
                  type="button"
                  onClick={() => pick(r)}
                  disabled={added}
                  className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-lg p-1 text-center transition-colors hover:bg-muted disabled:opacity-50"
                  title={r.full_name || r.efin_tag || r.email || ""}
                >
                  <Avatar url={r.avatar_url} label={initials(r)} size="sm" />
                  <span className="w-full truncate text-[11px] text-muted-foreground">
                    {added ? "Added" : (r.full_name?.split(" ")[0] || r.efin_tag || r.email)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search + type-ahead */}
      <div ref={boxRef} className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="email@example.com, @username, or 10-digit account #"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); setNotFound(false); }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => e.key === "Enter" && handleFind()}
              className="pl-9"
              autoComplete="off"
            />
          </div>
          <Button onClick={handleFind} disabled={finding || query.trim().length < 3}>
            {finding ? <LoadingSpinner size={16} /> : "Find"}
          </Button>
        </div>

        <AnimatePresence>
          {open && debounced.replace(/^@/, "").length >= 3 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
            >
              {isFetching && suggestions.length === 0 ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <LoadingSpinner size={14} /> Searching…
                </div>
              ) : suggestions.length === 0 ? (
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="text-sm text-muted-foreground">No eFinMoney user found</span>
                  <Button size="sm" variant="ghost" onClick={invite}>
                    <Share2 className="mr-1 h-3.5 w-3.5" /> Invite
                  </Button>
                </div>
              ) : (
                <ul className="max-h-72 overflow-y-auto">
                  {suggestions.map((s) => {
                    const added = isAlreadyAdded(s.user_id);
                    return (
                      <li key={s.user_id}>
                        <button
                          type="button"
                          disabled={added}
                          onClick={() => pick({
                            user_id: s.user_id,
                            full_name: s.full_name,
                            efin_tag: s.efin_tag,
                            avatar_url: s.avatar_url,
                            email: null,
                            account_number: s.account_number,
                          })}
                          className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted disabled:opacity-60"
                        >
                          <Avatar url={s.avatar_url} label={initials({ ...s, email: s.email_masked })} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {s.full_name || s.efin_tag || s.email_masked}
                            </p>
                            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                              {s.efin_tag && <span>@{s.efin_tag}</span>}
                              {s.email_masked && <span>{s.email_masked}</span>}
                            </div>
                          </div>
                          {added && <Badge variant="secondary">Added</Badge>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {notFound && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>No eFinMoney user found for "{query}".</span>
            <Button size="sm" variant="ghost" onClick={invite}>
              <Share2 className="mr-1 h-3.5 w-3.5" /> Invite them
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default EfinRecipientQuickPick;
