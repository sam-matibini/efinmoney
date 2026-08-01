import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Sparkles, CalendarClock, ArrowLeft, X, LogIn, ChevronRight } from "lucide-react";
import BookingEmbed from "@/components/booking/BookingEmbed";
import { ALICE_OPEN_EVENT, type AliceMode } from "@/components/alice/aliceBus";

/**
 * Public, Alice-branded launcher for the marketing pages. Alice's chat is
 * auth-gated, so logged-out visitors get the booking flow (public Reception AI
 * embed) plus a nudge to sign in for the full assistant — no LLM runs here.
 * Opens on tap or via the shared `alice:open` bus event (e.g. "Talk to sales").
 */
export default function PublicAliceLauncher() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "booking">("menu");

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ mode?: AliceMode }>).detail;
      setOpen(true);
      setView(detail?.mode === "booking" ? "booking" : "menu");
    };
    window.addEventListener(ALICE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ALICE_OPEN_EVENT, onOpen);
  }, []);

  return (
    <>
      {/* Floating launcher — bottom-right, Alice-branded */}
      <button
        onClick={() => { setView("menu"); setOpen(true); }}
        aria-label="Ask Alice or book a call"
        className="fixed right-4 bottom-6 z-50 h-14 w-14 rounded-full shadow-lg overflow-hidden bg-gradient-primary text-primary-foreground flex items-center justify-center ring-2 ring-background"
      >
        <Sparkles className="h-6 w-6" />
        <img
          src="/alice.png"
          alt="Alice AI"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
          className="absolute inset-0 h-full w-full object-cover object-top pointer-events-none"
        />
      </button>

      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setView("menu"); }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0" hideClose>
          {view === "booking" ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 px-4 h-14 border-b shrink-0">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView("menu")} aria-label="Back">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
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
          ) : (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center gap-2 px-4 h-14 border-b shrink-0">
                <div className="relative h-8 w-8 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center overflow-hidden">
                  <Sparkles className="h-4 w-4" />
                  <img
                    src="/alice.png"
                    alt="Alice"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                    className="absolute inset-0 h-full w-full object-cover object-top"
                  />
                </div>
                <div className="leading-tight flex-1">
                  <div className="font-semibold text-sm">Alice AI</div>
                  <div className="text-xs text-muted-foreground">EfinMoney assistant</div>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Menu */}
              <div className="flex-1 p-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Hi, I'm Alice 👋 Want to talk to our team, or ask me about EfinMoney?
                </p>

                <button
                  onClick={() => setView("booking")}
                  className="w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold">Book a call with our team</span>
                    <span className="block text-xs text-muted-foreground">Pick a time in seconds</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>

                <Link
                  to="/auth?mode=signin"
                  className="w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <LogIn className="h-4 w-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold">Sign in to chat with Alice</span>
                    <span className="block text-xs text-muted-foreground">Ask about your account &amp; transfers</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
