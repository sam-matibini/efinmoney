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
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem("alice_hidden") === "1"; } catch { return false; }
  });
  const setHiddenPersist = (v: boolean) => {
    setHidden(v);
    try { localStorage.setItem("alice_hidden", v ? "1" : "0"); } catch { /* ignore */ }
  };
  const { messages, isSending, send, newChat, loadConversation, conversations } = useAliceChat(context);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = (text: string) => {
    if (!text.trim() || isSending) return;
    setInput("");
    send(text);
  };

  return (
    <>
      {/* Floating launcher — dismissible. When hidden, a slim edge handle restores it. */}
      {hidden ? (
        <button
          onClick={() => setHiddenPersist(false)}
          aria-label="Show Alice AI assistant"
          className="fixed z-40 right-0 bottom-24 md:bottom-6 h-11 w-7 rounded-l-xl shadow-md flex items-center justify-center bg-gradient-primary/70 text-primary-foreground hover:bg-gradient-primary transition-colors"
        >
          <Sparkles className="h-4 w-4" />
        </button>
      ) : (
        <div className="fixed z-40 right-4 bottom-24 md:bottom-6">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open Alice AI assistant"
            className={cn(
              "relative h-14 w-14 rounded-full shadow-lg overflow-hidden",
              "bg-gradient-primary text-primary-foreground flex items-center justify-center ring-2 ring-background",
              "hover:scale-105 active:scale-95 transition-transform",
            )}
          >
            <Sparkles className="h-6 w-6" />
            <img
              src="/alice.png"
              alt="Alice AI"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              className="absolute inset-0 h-full w-full object-cover object-top"
            />
          </button>
          <button
            onClick={() => setHiddenPersist(true)}
            aria-label="Hide Alice"
            className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-background border border-border shadow flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

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
