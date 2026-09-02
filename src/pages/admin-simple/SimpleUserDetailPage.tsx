import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Wallet, MessageSquare, Banknote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchUserMoneyTimeline } from "@/lib/adminUserMoneyTimeline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const db = supabase as unknown as { from: (t: string) => any };

function money(n: number, ccy: string) {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: ccy || "CAD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${Number(n).toFixed(2)} ${ccy}`;
  }
}

export default function SimpleUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [surface, setSurface] = useState("all");
  const [provider, setProvider] = useState("all");
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyBusy, setReplyBusy] = useState<Record<string, boolean>>({});

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["simple-admin-profile", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: kyc } = useQuery({
    queryKey: ["simple-admin-kyc", id],
    queryFn: async () => {
      const { data } = await supabase.from("kyc_verifications").select("*").eq("user_id", id!).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: wallets = [], isLoading: walletsLoading } = useQuery({
    queryKey: ["simple-admin-wallets", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_user_wallet_balances", { p_user_id: id! });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const { data: timeline = [], isLoading: moneyLoading } = useQuery({
    queryKey: ["simple-admin-money", id],
    queryFn: () => fetchUserMoneyTimeline(id!, 150),
    enabled: !!id,
  });

  const { data: threads = [], isLoading: threadsLoading } = useQuery({
    queryKey: ["simple-admin-support", id],
    queryFn: async () => {
      const { data: threadRows } = await db
        .from("support_threads")
        .select("id,subject,status,last_message_at")
        .eq("user_id", id!)
        .order("last_message_at", { ascending: false })
        .limit(25);
      const list = threadRows || [];
      if (!list.length) return [] as {
        id: string;
        subject: string;
        status: string;
        last_message_at: string;
        messages: { id: string; sender_role: string; body: string; created_at: string }[];
      }[];

      const { data: messageRows } = await db
        .from("support_messages")
        .select("id,thread_id,sender_role,body,created_at")
        .in("thread_id", list.map((t: { id: string }) => t.id))
        .order("created_at", { ascending: true });

      const byThread = new Map<string, typeof messageRows>();
      for (const m of messageRows || []) {
        const arr = byThread.get(m.thread_id) || [];
        arr.push(m);
        byThread.set(m.thread_id, arr);
      }
      return list.map((t: { id: string; subject: string; status: string; last_message_at: string }) => ({
        ...t,
        messages: byThread.get(t.id) || [],
      }));
    },
    enabled: !!id,
  });

  const providers = useMemo(() => {
    const set = new Set(timeline.map((e) => e.provider));
    return Array.from(set).sort();
  }, [timeline]);

  const filteredMoney = useMemo(() => {
    return timeline.filter((e) => {
      if (surface !== "all" && e.surface !== surface) return false;
      if (provider !== "all" && e.provider !== provider) return false;
      return true;
    });
  }, [timeline, surface, provider]);

  const sendReply = async (threadId: string) => {
    const body = (replyText[threadId] || "").trim();
    if (!body || !id) return;
    setReplyBusy((s) => ({ ...s, [threadId]: true }));
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { error } = await db.from("support_messages").insert({
        thread_id: threadId,
        sender_role: "staff",
        sender_id: uid,
        body,
        attachments: [],
      });
      if (error) throw error;
      void supabase.functions.invoke("notify-user", {
        body: { user_id: id, type: "support_reply", message: body.slice(0, 500) },
      });
      setReplyText((s) => ({ ...s, [threadId]: "" }));
      toast.success("Reply sent");
      await qc.invalidateQueries({ queryKey: ["simple-admin-support", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reply failed");
    } finally {
      setReplyBusy((s) => ({ ...s, [threadId]: false }));
    }
  };

  if (!id) return null;

  return (
    <div className="space-y-8">
      <Link
        to="/admin/simple/users"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--brand-700))] hover:text-amber-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> All users
      </Link>

      {profileLoading ? (
        <div className="h-36 animate-pulse rounded-2xl bg-slate-200/80" />
      ) : !profile ? (
        <p className="text-slate-500">User not found.</p>
      ) : (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-900))] via-[hsl(var(--brand-800))] to-[hsl(256_60%_28%)] px-6 py-7 sm:px-8 text-white shadow-card-purple">
          <div aria-hidden className="pointer-events-none absolute -right-10 top-0 h-40 w-40 rounded-full bg-amber-400/20 blur-2xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/90">Customer</p>
              <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
                {profile.full_name || profile.email || "User"}
              </h1>
              <p className="mt-1 text-sm text-white/65">{profile.email}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-white/90">
                  {(profile.account_status || "—").replace(/_/g, " ")}
                </span>
                <span className="rounded-full bg-[hsl(var(--accent-amber))] px-2.5 py-0.5 text-[11px] font-semibold capitalize text-[hsl(var(--brand-900))]">
                  KYC {(profile.kyc_status || "—").replace(/_/g, " ")}
                  {profile.kyc_tier ? ` · ${String(profile.kyc_tier).replace(/_/g, " ")}` : ""}
                </span>
                {kyc?.status && (
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-amber-100">
                    Verif: {String(kyc.status).replace(/_/g, " ")}
                  </span>
                )}
              </div>
            </div>
            <Link
              to={`/admin/users/${id}`}
              className="rounded-full border border-white/25 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/15 transition-colors"
            >
              Open in Classic
            </Link>
          </div>
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="h-auto w-full justify-start gap-1 rounded-full bg-[hsl(var(--brand-900)/0.06)] p-1">
          <TabsTrigger
            value="overview"
            className="rounded-full data-[state=active]:bg-[hsl(var(--accent-amber))] data-[state=active]:text-[hsl(var(--brand-900))] data-[state=active]:shadow-cta-amber"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="money"
            className="rounded-full data-[state=active]:bg-[hsl(var(--accent-amber))] data-[state=active]:text-[hsl(var(--brand-900))] data-[state=active]:shadow-cta-amber"
          >
            Money
          </TabsTrigger>
          <TabsTrigger
            value="support"
            className="rounded-full data-[state=active]:bg-[hsl(var(--accent-amber))] data-[state=active]:text-[hsl(var(--brand-900))] data-[state=active]:shadow-cta-amber"
          >
            Support
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="rounded-2xl border border-[hsl(var(--brand-900)/0.08)] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-amber-600" />
              <h2 className="font-display text-lg font-semibold text-[hsl(var(--brand-900))]">Wallets</h2>
            </div>
            {walletsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : wallets.length === 0 ? (
              <p className="text-sm text-slate-500">No wallets.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {wallets.map((w) => (
                  <div
                    key={w.wallet_id}
                    className="rounded-xl border border-amber-100 bg-gradient-to-br from-white to-amber-50/40 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[hsl(var(--brand-900))]">
                        {w.flag_emoji} {w.currency_code}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400 capitalize">{w.status}</span>
                    </div>
                    <p className="mt-2 font-display text-2xl font-bold tabular-nums text-[hsl(var(--brand-900))]">
                      {money(Number(w.balance), w.currency_code)}
                    </p>
                    <p className="text-xs text-slate-500">{w.currency_name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[hsl(var(--brand-900)/0.08)] bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-display text-lg font-semibold text-[hsl(var(--brand-900))]">Profile</h2>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              {[
                ["Phone", profile?.phone_number],
                ["Country", profile?.country_code || profile?.address_country],
                ["Account #", profile?.account_number],
                ["Tag", profile?.efin_tag ? `@${profile.efin_tag}` : null],
                ["Joined", profile?.created_at ? format(new Date(profile.created_at), "dd MMM yyyy HH:mm") : null],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="mt-0.5 font-medium text-[hsl(var(--brand-900))]">{value || "—"}</p>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="money" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={surface} onValueChange={setSurface}>
              <SelectTrigger className="w-[130px] rounded-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All pages</SelectItem>
                <SelectItem value="send">Send</SelectItem>
                <SelectItem value="topup">Top-up</SelectItem>
              </SelectContent>
            </Select>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="w-[140px] rounded-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-slate-400">{filteredMoney.length} events</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[hsl(var(--brand-900)/0.08)] bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-display text-lg font-semibold text-[hsl(var(--brand-900))] flex items-center gap-2">
                <Banknote className="h-4 w-4 text-amber-600" /> Money timeline
              </h2>
              <p className="text-sm text-slate-500">Sends and top-ups · labeled by provider</p>
            </div>
            <div className="p-2 sm:p-4">
              {moneyLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : filteredMoney.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">No money moves for these filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>When</TableHead>
                        <TableHead>Page</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMoney.map((e) => (
                        <TableRow key={e.id} className="hover:bg-amber-50/40">
                          <TableCell className="text-xs whitespace-nowrap text-slate-500">
                            {format(new Date(e.createdAt), "dd MMM yy HH:mm")}
                          </TableCell>
                          <TableCell>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-700">
                              {e.surface === "send" ? "Send" : "Top-up"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="rounded-full bg-[hsl(var(--brand-900))] px-2 py-0.5 text-[11px] font-semibold capitalize text-amber-300">
                              {e.provider}
                            </span>
                          </TableCell>
                          <TableCell className="font-display font-semibold tabular-nums whitespace-nowrap text-[hsl(var(--brand-900))]">
                            {money(e.amount, e.currency)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                /fail|cancel|reject/i.test(e.status)
                                  ? "destructive"
                                  : /complete|success|paid|credit/i.test(e.status)
                                  ? "default"
                                  : "outline"
                              }
                            >
                              {e.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs max-w-[260px]">
                            <div className="truncate" title={e.detail}>{e.detail}</div>
                            {e.failure && (
                              <div className="text-destructive truncate" title={e.failure}>{e.failure}</div>
                            )}
                            {e.transferId && (
                              <Link className="text-amber-700 hover:underline font-medium" to={`/transfers/${e.transferId}`}>
                                Transfer
                              </Link>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="support" className="space-y-4">
          {threadsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : threads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 py-12 text-center text-sm text-slate-500">
              No support threads for this user.
            </div>
          ) : (
            threads.map((t) => (
              <div key={t.id} className="rounded-2xl border border-[hsl(var(--brand-900)/0.08)] bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display font-semibold text-[hsl(var(--brand-900))] flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-amber-600" />
                      {t.subject || "Support"}
                    </h3>
                    {t.last_message_at && (
                      <p className="text-xs text-slate-400 mt-1">
                        Last activity {format(new Date(t.last_message_at), "dd MMM yyyy HH:mm")}
                      </p>
                    )}
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-amber-900">
                    {t.status}
                  </span>
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  {t.messages.length === 0 ? (
                    <p className="text-xs text-slate-400">No messages yet.</p>
                  ) : (
                    t.messages.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          "rounded-xl px-3 py-2 text-sm",
                          m.sender_role === "staff"
                            ? "ml-6 bg-gradient-to-br from-[hsl(var(--brand-900))] to-[hsl(var(--brand-800))] text-white"
                            : "mr-6 border border-amber-100 bg-white",
                        )}
                      >
                        <p className={cn(
                          "text-[10px] uppercase tracking-wide mb-0.5",
                          m.sender_role === "staff" ? "text-amber-300/80" : "text-slate-400",
                        )}>
                          {m.sender_role} · {format(new Date(m.created_at), "dd MMM HH:mm")}
                        </p>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <Input
                    className="rounded-full"
                    placeholder="Reply as staff…"
                    value={replyText[t.id] || ""}
                    onChange={(e) => setReplyText((s) => ({ ...s, [t.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendReply(t.id);
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="rounded-full bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] hover:bg-amber-400 shadow-cta-amber"
                    disabled={replyBusy[t.id] || !(replyText[t.id] || "").trim()}
                    onClick={() => void sendReply(t.id)}
                  >
                    Send
                  </Button>
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
