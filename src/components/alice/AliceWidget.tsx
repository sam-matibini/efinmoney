import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  Headphones,
  History,
  Loader2,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useAliceChat, type AliceMessage } from "@/hooks/useAliceChat";
import { useProfile } from "@/hooks/useProfile";
import { useKyb } from "@/hooks/useKyb";
import { kybResumePath } from "@/lib/kybOnboarding";
import LiveSupportChat from "@/components/support/LiveSupportChat";
import BookingEmbed from "@/components/booking/BookingEmbed";
import { ALICE_OPEN_EVENT, modeToTab, type AliceMode } from "@/components/alice/aliceBus";
import AliceReceptionistPill from "@/components/alice/AliceReceptionistPill";
import { AliceAdvisorChrome, AliceCard } from "@/components/alice/AliceAdvisorChrome";
import AliceCallHero from "@/components/alice/AliceCallHero";
import AliceLiveCall from "@/components/alice/AliceLiveCall";
import { ALICE_FOREST, type AliceTab } from "@/components/alice/aliceAdvisorTheme";

/** Show human support after Alice has tried — not on a fresh empty chat. */
function shouldOfferHumanSupport(messages: AliceMessage[]): boolean {
  const replies = messages.filter((m) => m.role === "assistant" && !m.pending && m.content.trim());
  if (replies.length === 0) return false;
  if (replies.length >= 2) return true;
  const last = replies[replies.length - 1].content;
  if (last.startsWith("⚠️")) return true;
  return /\b(talk to (a )?human|contact support|reach (out to )?support|speak (to|with) (our )?(support|a human|an agent|someone)|our support team|I('m| am) (not able|unable)|I can'?t (help|resolve|fix|fix that|do that)|beyond what I can|human support)\b/i.test(
    last,
  );
}

const STARTERS: Record<"user" | "admin", string[]> = {
  user: [
    "What's my balance?",
    "How do I send money to Nigeria?",
    "What's my KYC status?",
    "How do I add money to my wallet?",
  ],
  admin: [
    "How many KYC are pending review?",
    "Give me the settlement reconciliation summary",
    "How many open incidents are there?",
    "Look up a user by email",
  ],
};

function firstNameOf(fullName: string | null | undefined, email: string | null | undefined) {
  if (fullName?.trim()) return fullName.trim().split(/\s+/)[0];
  if (email?.includes("@")) return email.split("@")[0];
  return null;
}

export default function AliceWidget({ context }: { context: "user" | "admin" }) {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { business } = useKyb();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AliceTab>("home");
  const [overlay, setOverlay] = useState<"support" | "booking" | null>(null);
  const [liveCall, setLiveCall] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState("");
  const { messages, isSending, conversationId, send, newChat, loadConversation, conversations } =
    useAliceChat(context);
  const bottomRef = useRef<HTMLDivElement>(null);
  const offerHumanSupport = context === "user" && shouldOfferHumanSupport(messages);
  const firstName = firstNameOf(profile?.full_name, profile?.email);

  const kycCard = useMemo(() => {
    if (context !== "user" || !profile) return null;
    // Business accounts verify with KYB, not personal KYC.
    if (business?.id) {
      if (business.kyb_status === "approved") return null;
      return {
        next: business.kyb_status === "pending_review" ? "KYB under review" : "Finish business verification",
        label: "Business account · KYB, not personal KYC",
        progress: business.kyb_status === "pending_review" ? 80 : 40,
        href: kybResumePath(business),
      };
    }
    const status = (profile.kyc_status || "").toLowerCase();
    if (status === "approved" || status === "verified") return null;
    const started = Boolean(status && status !== "not_started");
    return {
      next: started ? "Complete verification" : "Start verification",
      label: started ? "1 of 2 done · About 2 minutes left" : "0 of 2 done · About 3 minutes left",
      progress: started ? 50 : 12,
      href: "/kyc",
    };
  }, [context, profile, business]);

  const recentSnippet = useMemo(() => {
    const last = [...messages].reverse().find((m) => !m.pending && m.content.trim());
    if (!last) return null;
    const text = last.content.replace(/\s+/g, " ").trim();
    return {
      role: last.role,
      text: text.length > 72 ? `${text.slice(0, 72)}…` : text,
    };
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tab]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ mode?: AliceMode }>).detail;
      const mode = detail?.mode ?? "home";
      setOpen(true);
      if (mode === "support" || mode === "booking") {
        setLiveCall(false);
        setOverlay(mode);
        setTab("home");
      } else {
        setOverlay(null);
        const next = modeToTab(mode);
        setTab(next);
        setLiveCall(next === "call" || mode === "call");
      }
    };
    window.addEventListener(ALICE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ALICE_OPEN_EVENT, onOpen);
  }, []);

  const submit = (text: string) => {
    if (!text.trim() || isSending) return;
    setInput("");
    send(text);
  };

  const startCallWithAlice = () => {
    setOverlay(null);
    setTab("call");
    setLiveCall(true);
  };

  const close = () => {
    setLiveCall(false);
    setOpen(false);
    setOverlay(null);
    setTab("home");
    setShowHistory(false);
  };

  return (
    <>
      {!open && (
        <AliceReceptionistPill
          onClick={() => {
            setOverlay(null);
            setTab("call");
            setLiveCall(true);
            setOpen(true);
          }}
        />
      )}

      <AliceAdvisorChrome
        open={open && !overlay && !liveCall}
        firstName={firstName}
        tab={tab}
        onTabChange={(t) => {
          setShowHistory(false);
          setLiveCall(false);
          setTab(t);
          if (t === "call") setLiveCall(true);
        }}
        onClose={close}
        onMinimize={close}
      >
        {tab === "home" && (
          <ScrollArea className="flex-1">
            <div className="p-3.5 space-y-3 pb-4">
              <AliceCallHero onCall={startCallWithAlice} />

              {recentSnippet && (
                <AliceCard onClick={() => setTab("messages")}>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-2">
                    Recent message
                  </p>
                  <div className="flex items-start gap-3">
                    <span
                      className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-white"
                      style={{ background: ALICE_FOREST }}
                    >
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {recentSnippet.role === "user" ? "You" : "Alice"}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{recentSnippet.text}</p>
                    </div>
                  </div>
                </AliceCard>
              )}

              {kycCard && (
                <AliceCard
                  onClick={() => {
                    close();
                    navigate(kycCard.href);
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-900">Get ready to send</span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                  <p className="text-xs text-slate-500 mb-2.5">{kycCard.label}</p>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${kycCard.progress}%`, background: ALICE_FOREST }}
                    />
                  </div>
                  <p className="text-xs text-slate-600">Next step: {kycCard.next}</p>
                </AliceCard>
              )}

              <AliceCard>
                <p className="text-sm font-semibold text-slate-900 text-center">Now live with Alice</p>
                <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    style={{ color: ALICE_FOREST }}
                    onClick={() => {
                      setTab("messages");
                      submit("How do I add money to my wallet?");
                    }}
                  >
                    Auto wallet top-up tips
                  </button>
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    style={{ color: ALICE_FOREST }}
                    onClick={() => {
                      setTab("messages");
                      submit("How do I send money internationally?");
                    }}
                  >
                    Schedule a transfer
                  </button>
                </div>
              </AliceCard>

              {context === "user" && (
                <AliceCard onClick={() => setOverlay("booking")}>
                  <div className="flex items-center gap-3">
                    <span
                      className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: `${ALICE_FOREST}14`, color: ALICE_FOREST }}
                    >
                      <CalendarClock className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">Book a human call</p>
                      <p className="text-xs text-slate-500">Talk to the eFinMoney team</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                </AliceCard>
              )}
            </div>
          </ScrollArea>
        )}

        {tab === "call" && !liveCall && (
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <AliceCallHero
                size="hero"
                onCall={startCallWithAlice}
                title="Call Alice"
                subtitle="Live voice call — Alice rings, listens, and answers out loud."
              />
              {context === "user" && (
                <AliceCard onClick={() => setOverlay("booking")}>
                  <div className="flex items-center gap-3">
                    <CalendarClock className="h-5 w-5 shrink-0" style={{ color: ALICE_FOREST }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">Prefer a human?</p>
                      <p className="text-xs text-slate-500">Schedule a call with our team</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                </AliceCard>
              )}
            </div>
          </ScrollArea>
        )}

        {tab === "help" && (
          <ScrollArea className="flex-1">
            <div className="p-3.5 space-y-2.5">
              {STARTERS[context].map((s) => (
                <AliceCard
                  key={s}
                  onClick={() => {
                    setTab("messages");
                    submit(s);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-800">{s}</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                  </div>
                </AliceCard>
              ))}
              <AliceCard onClick={() => setOverlay("support")}>
                <div className="flex items-center gap-3">
                  <Headphones className="h-4 w-4" style={{ color: ALICE_FOREST }} />
                  <span className="text-sm font-medium">Talk to a human</span>
                </div>
              </AliceCard>
            </div>
          </ScrollArea>
        )}

        {tab === "tasks" && (
          <ScrollArea className="flex-1">
            <div className="p-3.5 space-y-2.5">
              <AliceCard onClick={startCallWithAlice}>
                <div className="flex items-center gap-3">
                  <span
                    className="h-9 w-9 rounded-full flex items-center justify-center text-white shrink-0"
                    style={{ background: ALICE_FOREST }}
                  >
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Ask Alice anything</p>
                    <p className="text-xs text-slate-500">Start a new AI conversation</p>
                  </div>
                </div>
              </AliceCard>
              {kycCard && (
                <AliceCard
                  onClick={() => {
                    close();
                    navigate(kycCard.href);
                  }}
                >
                  <p className="text-sm font-semibold">Finish account verification</p>
                  <p className="text-xs text-slate-500 mt-0.5">{kycCard.next}</p>
                </AliceCard>
              )}
              {context === "user" && (
                <>
                  <AliceCard
                    onClick={() => {
                      close();
                      navigate("/send");
                    }}
                  >
                    <p className="text-sm font-semibold">Send money</p>
                    <p className="text-xs text-slate-500 mt-0.5">Start an international transfer</p>
                  </AliceCard>
                  <AliceCard
                    onClick={() => {
                      close();
                      navigate("/wallet/topup");
                    }}
                  >
                    <p className="text-sm font-semibold">Add money</p>
                    <p className="text-xs text-slate-500 mt-0.5">Top up your wallet</p>
                  </AliceCard>
                </>
              )}
              {context === "admin" && (
                <AliceCard
                  onClick={() => {
                    setTab("messages");
                    submit("Give me today’s ops summary");
                  }}
                >
                  <p className="text-sm font-semibold">Ops daily brief</p>
                  <p className="text-xs text-slate-500 mt-0.5">Ask Alice for a snapshot</p>
                </AliceCard>
              )}
            </div>
          </ScrollArea>
        )}

        {tab === "messages" && (
          <div className="flex flex-col flex-1 min-h-0 bg-white rounded-t-2xl">
            <div className="flex items-center gap-1 px-2 py-1.5 border-b shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setShowHistory((s) => !s)}
                aria-label="History"
              >
                <History className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  newChat();
                  setShowHistory(false);
                }}
                aria-label="New chat"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-xs"
                style={{ color: ALICE_FOREST }}
                onClick={() => setTab("call")}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Call Alice
              </Button>
            </div>

            {showHistory && (
              <div className="border-b max-h-40 overflow-y-auto bg-white">
                {conversations.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground text-center">No past conversations</div>
                ) : (
                  conversations.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        loadConversation(c.id);
                        setShowHistory(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-muted/50 truncate"
                    >
                      {c.title || "Conversation"}
                    </button>
                  ))
                )}
              </div>
            )}

            <ScrollArea className="flex-1 px-3">
              <div className="py-3 space-y-3">
                {messages.length === 0 && (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">
                      You&apos;re connected with Alice. Ask about{" "}
                      {context === "admin" ? "operations" : "your account"} or tap a suggestion.
                    </p>
                    <div className="flex flex-col gap-2">
                      {STARTERS[context].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => submit(s)}
                          className="text-left text-sm rounded-xl border border-black/5 bg-white px-3 py-2 hover:bg-slate-50"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m, i) => (
                  <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm break-words",
                        m.role === "user" ? "text-white whitespace-pre-wrap" : "bg-slate-100 text-slate-900",
                      )}
                      style={m.role === "user" ? { background: ALICE_FOREST } : undefined}
                    >
                      {m.pending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : m.role === "assistant" ? (
                        <div className="alice-md [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_strong]:font-semibold [&_a]:underline [&_a]:underline-offset-2">
                          <ReactMarkdown
                            components={{
                              a: ({ href, children }) => (
                                <a href={href} target="_blank" rel="noreferrer noopener">
                                  {children}
                                </a>
                              ),
                            }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        m.content
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            <div className="border-t shrink-0 bg-white">
              {offerHumanSupport && (
                <div className="border-b">
                  <button
                    type="button"
                    onClick={() => setOverlay("support")}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
                  >
                    <Headphones className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">Still stuck? Talk to a human</span>
                  </button>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(input);
                }}
                className="p-2.5 flex items-center gap-2"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Message Alice…"
                  disabled={isSending}
                  className="flex-1 rounded-full bg-slate-50 border-black/5"
                  autoFocus
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={isSending || !input.trim()}
                  aria-label="Send"
                  className="rounded-full"
                  style={{ background: ALICE_FOREST }}
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </div>
          </div>
        )}
      </AliceAdvisorChrome>

      {/* Live voice call */}
      {open && liveCall && !overlay && (
        <div className="fixed z-50 right-3 bottom-3 sm:right-5 sm:bottom-5 w-[min(100vw-1.5rem,380px)] h-[min(72vh,640px)] flex flex-col overflow-hidden rounded-[1.35rem] border border-black/5 shadow-[0_24px_64px_rgba(15,23,42,0.22)]">
          <AliceLiveCall
            active={liveCall}
            send={send}
            onEnd={() => {
              setLiveCall(false);
              setTab("home");
            }}
            onOpenMessages={() => {
              setLiveCall(false);
              setTab("messages");
            }}
          />
        </div>
      )}

      {/* Full-panel overlays (support / booking) */}
      {open && overlay && (
        <div className="fixed z-50 right-3 bottom-3 sm:right-5 sm:bottom-5 w-[min(100vw-1.5rem,380px)] h-[min(72vh,640px)] flex flex-col overflow-hidden rounded-[1.35rem] border border-black/5 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.22)]">
          {overlay === "support" ? (
            <LiveSupportChat
              onBack={() => setOverlay(null)}
              aliceConversationId={context === "user" ? conversationId : null}
              aliceMessages={context === "user" ? messages : []}
              aliceTitle={
                context === "user"
                  ? messages.find((m) => m.role === "user")?.content?.slice(0, 60) ?? null
                  : null
              }
            />
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 px-4 h-14 border-b shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setOverlay(null)}
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center"
                  style={{ background: `${ALICE_FOREST}14`, color: ALICE_FOREST }}
                >
                  <CalendarClock className="h-4 w-4" />
                </div>
                <div className="leading-tight flex-1">
                  <div className="font-semibold text-sm">Book a call</div>
                  <div className="text-xs text-muted-foreground">Talk to the eFinMoney team</div>
                </div>
              </div>
              <div className="relative flex-1">
                <BookingEmbed className="absolute inset-0" />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
