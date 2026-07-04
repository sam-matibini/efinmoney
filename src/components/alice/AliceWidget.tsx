import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Sparkles, Send, Plus, History, X, Loader2 } from "lucide-react";
import { useAliceChat } from "@/hooks/useAliceChat";

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

export default function AliceWidget({ context }: { context: "user" | "admin" }) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState("");
  const { messages, isSending, send, newChat, loadConversation, conversations } = useAliceChat(context);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── draggable launcher (position persisted per browser) ── */
  const SIZE = 56;
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const moved = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const grab = useRef({ x: 0, y: 0 });

  useEffect(() => { posRef.current = pos; }, [pos]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("alice_pos");
      if (saved) setPos(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const clamp = (x: number, y: number) => ({
    x: Math.min(Math.max(8, x), window.innerWidth - SIZE - 8),
    y: Math.min(Math.max(8, y), window.innerHeight - SIZE - 8),
  });

  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    dragging.current = true;
    moved.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    const rect = btnRef.current!.getBoundingClientRect();
    grab.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    btnRef.current!.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return;
    if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 4) moved.current = true;
    if (moved.current) setPos(clamp(e.clientX - grab.current.x, e.clientY - grab.current.y));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    try { btnRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (moved.current) {
      try { if (posRef.current) localStorage.setItem("alice_pos", JSON.stringify(posRef.current)); } catch { /* ignore */ }
    } else {
      setOpen((o) => !o); // a tap (no drag) opens/closes the chat
    }
  };

  const submit = (text: string) => {
    if (!text.trim() || isSending) return;
    setInput("");
    send(text);
  };

  return (
    <>
      {/* Floating launcher — drag to reposition (saved), tap to open/close the chat */}
      <button
        ref={btnRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="Alice AI assistant — drag to move, tap to open"
        className={cn(
          "fixed z-40 h-14 w-14 rounded-full shadow-lg overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing",
          "bg-gradient-primary text-primary-foreground flex items-center justify-center ring-2 ring-background",
          pos ? "" : "right-4 bottom-24 md:bottom-6",
        )}
        style={pos ? { left: pos.x, top: pos.y } : undefined}
      >
        <Sparkles className="h-6 w-6" />
        <img
          src="/alice.png"
          alt="Alice AI"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
          className="absolute inset-0 h-full w-full object-cover object-top pointer-events-none"
        />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
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
              <div className="text-xs text-muted-foreground">EfinMoney assistant{context === "admin" ? " · admin" : ""}</div>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowHistory((s) => !s)} aria-label="History">
              <History className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { newChat(); setShowHistory(false); }} aria-label="New chat">
              <Plus className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* History drawer */}
          {showHistory && (
            <div className="border-b max-h-56 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground text-center">No past conversations</div>
              ) : conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { loadConversation(c.id); setShowHistory(false); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-muted/50 truncate"
                >
                  {c.title || "Conversation"}
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1 px-4">
            <div className="py-4 space-y-4">
              {messages.length === 0 && (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Hi, I'm Alice 👋 Ask me anything about EfinMoney{context === "admin" ? " or your operations" : " or your account"}.
                  </div>
                  <div className="flex flex-col gap-2">
                    {STARTERS[context].map((s) => (
                      <button
                        key={s}
                        onClick={() => submit(s)}
                        className="text-left text-sm rounded-lg border px-3 py-2 hover:bg-muted/50 transition-colors"
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
                      "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    {m.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : m.content}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {/* Composer */}
          <form
            onSubmit={(e) => { e.preventDefault(); submit(input); }}
            className="border-t p-3 flex items-center gap-2 shrink-0"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Alice…"
              disabled={isSending}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={isSending || !input.trim()} aria-label="Send">
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
