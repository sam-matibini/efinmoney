import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, User, AlertCircle, Clock, Share2, Plus, Check } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { avatarColorClasses } from "@/lib/avatarColor";

export interface QuickPickRecipient {
  user_id: string;
  full_name: string | null;
  efin_tag: string | null;
  email: string | null;
  avatar_url: string | null;
  account_number?: string | null;
  base_currency?: string | null;
}

interface SearchRow {
  user_id: string;
  full_name: string | null;
  efin_tag: string | null;
  avatar_url: string | null;
  email_masked: string | null;
  account_number: string | null;
  base_currency: string | null;
}

interface RecentRow {
  user_id: string;
  full_name: string | null;
  efin_tag: string | null;
  avatar_url: string | null;
  email: string | null;
  account_number: string | null;
  last_sent_at: string;
  base_currency: string | null;
}

interface Props {
  onSelect: (recipient: QuickPickRecipient) => void;
  isAlreadyAdded: (userId: string) => boolean;
}

const DIRECTORY_STALE_MS = 5 * 60 * 1000;
const TYPEAHEAD_STALE_MS = 30 * 1000;

const initials = (r: { full_name: string | null; efin_tag: string | null; email: string | null }) => {
  const src = r.full_name || r.efin_tag || r.email || "?";
  return src
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
};

const Avatar = ({ url, label, seed, size = "md" }: { url: string | null; label: string; seed?: string | null; size?: "sm" | "md" }) => {
  const cls = size === "sm" ? "w-9 h-9 text-xs" : "w-10 h-10 text-sm";
  return (
    <div className={`${cls} ${avatarColorClasses(seed)} rounded-full flex items-center justify-center shrink-0 font-semibold overflow-hidden`}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : label || <User className="w-4 h-4" />}
    </div>
  );
};

const normQuery = (raw: string) => {
  const q = raw.trim().toLowerCase();
  return q.startsWith("@") ? q.slice(1) : q;
};

const EfinRecipientQuickPick = ({ onSelect, isAlreadyAdded }: Props) => {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [finding, setFinding] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const autoLookupRef = useRef("");

  // Debounce the type-ahead query
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 150);
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
      // Not present in generated types — optional convenience RPC.
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
      ) => Promise<{ data: unknown; error: unknown }>)("recent_efin_recipients");
      if (error) throw error;
      return ((data ?? []) as RecentRow[]);

    },
  });

  // Pre-fetch the full eFinTag directory on mount. This is the main list the
  // user sees when the input is focused with no query.
  const {
    data: directory = [],
    isFetching: directoryFetching,
    error: directoryError,
    refetch: refetchDirectory,
  } = useQuery({
    queryKey: ["efin-list-recipients", ""],
    enabled: !!user?.id,
    staleTime: DIRECTORY_STALE_MS,
    gcTime: DIRECTORY_STALE_MS * 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_efin_recipients", {
        p_query: "",
        p_limit: 200,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as SearchRow[];
    },
  });

  // Typeahead: only fires for queries >= 3 chars. Below that we filter the
  // already-loaded directory client-side, so typing is instant.
  const {
    data: remoteMatches = [],
    isFetching: typeaheadFetching,
    error: typeaheadError,
    refetch: refetchTypeahead,
  } = useQuery({
    queryKey: ["efin-list-recipients", debounced],
    enabled: !!user?.id && debounced.length >= 3,
    staleTime: TYPEAHEAD_STALE_MS,
    gcTime: TYPEAHEAD_STALE_MS * 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_efin_recipients", { p_query: debounced });
      if (error) throw error;
      return (data ?? []) as SearchRow[];
    },
  });

  // Does the query resolve to the caller's own account? Lookups exclude self,
  // so without this the field misleadingly reports "no user found".
  const ownTag = (profile?.efin_tag ?? "").toLowerCase();
  const ownEmail = (profile?.email ?? user?.email ?? "").toLowerCase();
  const ownAcct = profile?.account_number ?? "";
  const normDebounced = normQuery(debounced);
  const isSelfQuery = (raw: string) => {
    const q = normQuery(raw);
    if (!q) return false;
    const digits = q.replace(/\D/g, "");
    return (
      (ownTag !== "" && ownTag === q) ||
      (ownEmail !== "" && ownEmail === q) ||
      (ownAcct !== "" && digits.length >= 6 && ownAcct === digits)
    );
  };
  const selfHit = isSelfQuery(debounced);

  // Decide which rows to show in the dropdown.
  // 1) query empty -> the full directory, already loaded
  // 2) query < 3 chars -> filter the directory client-side by tag/name
  // 3) query >= 3 chars -> server-side typeahead results
  const dropdownRows = useMemo(() => {
    if (debounced.length < 3) {
      const q = normDebounced;
      if (!q) return directory;
      return directory.filter((r) => {
        const tag = (r.efin_tag ?? "").toLowerCase();
        const name = (r.full_name ?? "").toLowerCase();
        return tag.startsWith(q) || name.includes(q);
      });
    }
    return remoteMatches;
  }, [debounced, normDebounced, directory, remoteMatches]);

  // Surface the dropdown error in a single place; server-side is the source of
  // truth for the typeahead case, client directory for the empty case.
  const dropdownError = debounced.length >= 3 ? typeaheadError : directoryError;
  const refetchDropdown = debounced.length >= 3 ? refetchTypeahead : refetchDirectory;
  const dropdownLoading = debounced.length >= 3 ? typeaheadFetching : directoryFetching;

  useEffect(() => setHighlight(0), [debounced, open]);

  // Auto exact-lookup when fuzzy list returns nothing (>= 3 chars, no hits,
  // caller didn't type their own tag).
  useEffect(() => {
    if (debounced.length < 3) { autoLookupRef.current = ""; return; }
    if (
      !open ||
      isSelfQuery(debounced) ||
      dropdownLoading ||
      remoteMatches.length > 0 ||
      autoLookupRef.current === debounced
    ) return;
    autoLookupRef.current = debounced;
    let cancelled = false;
    setFinding(true);
    supabase.rpc("lookup_efin_recipient", { p_query: debounced }).then(({ data, error }) => {
      if (cancelled) return;
      setFinding(false);
      if (error || !data?.length) return;
      const row = data[0] as QuickPickRecipient;
      if (row.user_id === user?.id) return;
      if (isAlreadyAdded(row.user_id)) return;
      onSelect(row);
      setQuery(""); setDebounced(""); setOpen(false);
    });
    return () => { cancelled = true; setFinding(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, remoteMatches.length, dropdownLoading, open]);

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
  };

  const pickRow = (s: SearchRow) =>
    pick({
      user_id: s.user_id,
      full_name: s.full_name,
      efin_tag: s.efin_tag,
      avatar_url: s.avatar_url,
      email: null,
      account_number: s.account_number,
      base_currency: s.base_currency,
    });

  // Exact lookup fallback (pasted email / @tag / account number) for the Find button.
  const handleFind = async () => {
    const q = query.trim();
    if (q.length < 3) {
      toast.error("Enter an email, @tag, or account number (min 3 chars)");
      return;
    }
    if (isSelfQuery(q)) {
      // Soft hint already shown in the dropdown; don't trigger another lookup.
      return;
    }
    setFinding(true);
    try {
      const { data, error } = await supabase.rpc("lookup_efin_recipient", { p_query: q });
      if (error) throw error;
      const row = (data ?? [])[0] as QuickPickRecipient | undefined;
      if (!row) {
        toast.error(`No eFinMoney user found for "${q}"`);
        return;
      }
      pick(row);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setFinding(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((h) => {
        const next = e.key === "ArrowDown" ? h + 1 : h - 1;
        const clamped = Math.max(0, Math.min(next, dropdownRows.length - 1));
        listRef.current?.children[clamped]?.scrollIntoView({ block: "nearest" });
        return clamped;
      });
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const target = open ? dropdownRows[highlight] : undefined;
      if (target) pickRow(target);
      else handleFind();
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
      {/* Recent recipients chip row (always visible when present) */}
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
                  <Avatar url={r.avatar_url} label={initials(r)} seed={r.user_id} size="sm" />
                  <span className="w-full truncate text-[11px] text-muted-foreground">
                    {added ? "Added" : (r.full_name?.split(" ")[0] || r.efin_tag || r.email)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Directory search + dropdown (single, always-visible input) */}
      <div ref={boxRef} className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              role="combobox"
              aria-expanded={open}
              aria-autocomplete="list"
              aria-controls="efin-recipient-listbox"
              placeholder="Search by name, @tag, email or account #"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onClick={() => setOpen(true)}
              onKeyDown={onKeyDown}
              className={`pl-9 ${query !== debounced || finding ? "pr-9" : ""}`}
              autoComplete="off"
            />
            {(query !== debounced || finding) && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <LoadingSpinner size={14} />
              </div>
            )}
          </div>
          <Button onClick={handleFind} disabled={finding || query.trim().length < 3}>
            {finding ? <LoadingSpinner size={16} /> : "Find"}
          </Button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
            >
              {selfHit ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <User className="h-4 w-4 shrink-0" aria-hidden /> This is your username
                </div>
              ) : dropdownLoading && dropdownRows.length === 0 ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <LoadingSpinner size={14} /> Loading eFinMoney users…
                </div>
              ) : dropdownError ? (
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                    {dropdownError instanceof Error ? dropdownError.message : "Couldn't load eFinMoney users"}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => refetchDropdown()}>
                    Retry
                  </Button>
                </div>
              ) : dropdownRows.length === 0 ? (
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="text-sm text-muted-foreground">No eFinMoney user found</span>
                  <Button size="sm" variant="ghost" onClick={invite}>
                    <Share2 className="mr-1 h-3.5 w-3.5" /> Invite
                  </Button>
                </div>
              ) : (
                <ul
                  id="efin-recipient-listbox"
                  role="listbox"
                  ref={listRef}
                  className="max-h-96 overflow-y-auto pb-2"
                >
                  {dropdownRows.map((s, i) => {
                    const added = isAlreadyAdded(s.user_id);
                    return (
                      <li key={s.user_id} role="option" aria-selected={i === highlight}>
                        <button
                          type="button"
                          disabled={added}
                          onMouseEnter={() => setHighlight(i)}
                          onClick={() => pickRow(s)}
                          className={`flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted disabled:opacity-60 ${
                            i === highlight ? "bg-muted" : ""
                          }`}
                        >
                          <Avatar url={s.avatar_url} label={initials({ ...s, email: s.email_masked })} seed={s.user_id} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {s.full_name || s.efin_tag || s.email_masked}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                              {s.efin_tag && <span className="font-medium text-foreground/70">@{s.efin_tag}</span>}
                              {s.email_masked && <span className="truncate">{s.email_masked}</span>}
                              {s.account_number && (
                                <span className="font-mono tracking-tight">·&nbsp;{s.account_number}</span>
                              )}
                            </div>
                          </div>
                          {added ? (
                            <Badge variant="secondary" className="shrink-0 gap-1">
                              <Check className="h-3 w-3" aria-hidden /> Added
                            </Badge>
                          ) : (
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors ${
                                i === highlight ? "bg-primary/10 text-primary" : ""
                              }`}
                              aria-hidden
                            >
                              <Plus className="h-4 w-4" />
                            </span>
                          )}
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
    </div>
  );
};

export default EfinRecipientQuickPick;
