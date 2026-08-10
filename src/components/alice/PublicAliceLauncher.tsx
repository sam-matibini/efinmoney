import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CalendarClock, ArrowLeft, ChevronRight, LogIn, MessageCircle } from "lucide-react";
import BookingEmbed from "@/components/booking/BookingEmbed";
import { ALICE_OPEN_EVENT, modeToTab, type AliceMode } from "@/components/alice/aliceBus";
import AliceReceptionistPill from "@/components/alice/AliceReceptionistPill";
import { AliceAdvisorChrome, AliceCard } from "@/components/alice/AliceAdvisorChrome";
import AliceCallHero from "@/components/alice/AliceCallHero";
import { ALICE_FOREST, type AliceTab } from "@/components/alice/aliceAdvisorTheme";

/**
 * Public Loop-style Alice Advisor. Call is the focal CTA; chat stays auth-gated.
 * @see https://go.bankonloop.com/dashboard/kyb
 */
export default function PublicAliceLauncher() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AliceTab>("home");
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ mode?: AliceMode }>).detail;
      const mode = detail?.mode ?? "home";
      setOpen(true);
      if (mode === "booking") {
        setBooking(true);
        setTab("home");
      } else {
        setBooking(false);
        const next = modeToTab(mode === "alice" ? "call" : mode);
        setTab(next === "messages" ? "call" : next);
      }
    };
    window.addEventListener(ALICE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ALICE_OPEN_EVENT, onOpen);
  }, []);

  const close = () => {
    setOpen(false);
    setBooking(false);
    setTab("home");
  };

  return (
    <>
      {!open && (
        <AliceReceptionistPill
          label="Ask Alice's AI Expert"
          onClick={() => {
            setBooking(false);
            setTab("call");
            setOpen(true);
          }}
        />
      )}

      <AliceAdvisorChrome
        open={open && !booking}
        firstName={null}
        tab={tab}
        onTabChange={setTab}
        onClose={close}
        onMinimize={close}
        showMessages={false}
      >
        {(tab === "home" || tab === "call") && (
          <ScrollArea className="flex-1">
            <div className="p-3.5 space-y-3 pb-4">
              <AliceCallHero
                size={tab === "call" ? "hero" : "card"}
                title="Call Alice"
                subtitle={
                  tab === "call"
                    ? "Sign in to talk with eFinMoney's AI Expert — or book a call with our team."
                    : "Talk to eFinMoney's AI Expert — instant help when you sign in"
                }
                onCall={() => {
                  navigate("/auth?mode=signin");
                }}
              />

              <AliceCard onClick={() => setBooking(true)}>
                <div className="flex items-center gap-3">
                  <span
                    className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `${ALICE_FOREST}14`, color: ALICE_FOREST }}
                  >
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">Book a call with our team</p>
                    <p className="text-xs text-slate-500">Pick a time in seconds</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </div>
              </AliceCard>

              <AliceCard>
                <Link to="/auth?mode=signin" className="flex items-center gap-3">
                  <span
                    className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `${ALICE_FOREST}14`, color: ALICE_FOREST }}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">Message Alice</span>
                    <span className="block text-xs text-slate-500">Sign in for account &amp; transfer help</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </Link>
              </AliceCard>

              {tab === "home" && (
                <AliceCard>
                  <Link to="/auth?mode=signin" className="flex items-center gap-3">
                    <span className="h-9 w-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                      <LogIn className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">Sign in to eFinMoney</span>
                      <span className="block text-xs text-slate-500">Wallets, cards, and send money</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </Link>
                </AliceCard>
              )}
            </div>
          </ScrollArea>
        )}

        {tab === "help" && (
          <ScrollArea className="flex-1">
            <div className="p-3.5 space-y-2.5">
              {[
                "How do I send money with eFinMoney?",
                "What countries can I send to?",
                "How long does a transfer take?",
              ].map((q) => (
                <AliceCard key={q}>
                  <Link to="/auth?mode=signin" className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-800">{q}</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                  </Link>
                </AliceCard>
              ))}
              <AliceCard onClick={() => setBooking(true)}>
                <div className="flex items-center gap-3">
                  <CalendarClock className="h-4 w-4" style={{ color: ALICE_FOREST }} />
                  <span className="text-sm font-medium">Book a call with our team</span>
                </div>
              </AliceCard>
            </div>
          </ScrollArea>
        )}

        {tab === "tasks" && (
          <ScrollArea className="flex-1">
            <div className="p-3.5 space-y-2.5">
              <AliceCard>
                <Link to="/auth?mode=signin" className="block">
                  <p className="text-sm font-semibold">Create your account</p>
                  <p className="text-xs text-slate-500 mt-0.5">Sign up and meet Alice</p>
                </Link>
              </AliceCard>
              <AliceCard onClick={() => setTab("call")}>
                <p className="text-sm font-semibold">Call Alice</p>
                <p className="text-xs text-slate-500 mt-0.5">Talk to the AI Expert</p>
              </AliceCard>
              <AliceCard onClick={() => setBooking(true)}>
                <p className="text-sm font-semibold">Book a discovery call</p>
                <p className="text-xs text-slate-500 mt-0.5">Meet the eFinMoney team</p>
              </AliceCard>
            </div>
          </ScrollArea>
        )}
      </AliceAdvisorChrome>

      {open && booking && (
        <div className="fixed z-50 right-3 bottom-3 sm:right-5 sm:bottom-5 w-[min(100vw-1.5rem,380px)] h-[min(72vh,640px)] flex flex-col overflow-hidden rounded-[1.35rem] border border-black/5 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.22)]">
          <div className="flex items-center gap-2 px-4 h-14 border-b shrink-0">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setBooking(false)}
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
    </>
  );
}
