import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Loader2, Headphones, ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  useSupportThreads, useThreadMessages, useCreateThread, useSendMessage, useUpdateThread,
} from "@/hooks/useSupport";
import type { AliceMessage } from "@/hooks/useAliceChat";
import { escalateAliceToSupport, findAliceSupportThreadId } from "@/lib/syncAliceToSupport";

type Props = {
  onBack: () => void;
  /** When opened from Alice, link/seed the CRM thread with Alice transcript. */
  aliceConversationId?: string | null;
  aliceMessages?: AliceMessage[];
  aliceTitle?: string | null;
};

// In-app live support chat, opened from Alice's "Talk to support". It reuses the
// support_threads/messages system (and its realtime + admin inbox), so staff
// answer from /admin/support and replies stream back here in real time.
export default function LiveSupportChat({
  onBack,
  aliceConversationId = null,
  aliceMessages = [],
  aliceTitle = null,
}: Props) {
  const { data: threads = [] } = useSupportThreads();
  const create = useCreateThread();
  const send = useSendMessage();
  const update = useUpdateThread();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [seeding, setSeeding] = useState(false);
  const seededRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Prefer the Alice-linked CRM thread when escalating from Alice.
  const aliceThread = useMemo(() => {
    if (!aliceConversationId) return null;
    const ref = `alice:${aliceConversationId}`;
    return threads.find((t) => t.channel_ref === ref) ?? null;
  }, [threads, aliceConversationId]);

  const openThread = useMemo(
    () => aliceThread ?? threads.find((t) => t.status === "open" || t.status === "pending") ?? null,
    [threads, aliceThread],
  );
  const threadId = activeId ?? openThread?.id ?? null;
  const { data: messages = [] } = useThreadMessages(threadId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Seed/escalate Alice transcript into Support CRM once when opened from Alice.
  useEffect(() => {
    if (seededRef.current) return;
    if (!aliceConversationId && aliceMessages.length === 0) return;
    seededRef.current = true;
    setSeeding(true);
    void (async () => {
      try {
        const existing = await findAliceSupportThreadId(aliceConversationId);
        const id = await escalateAliceToSupport({
          conversationId: aliceConversationId,
          title: aliceTitle,
          messages: aliceMessages,
        });
        if (id) setActiveId(id);
        else if (existing) setActiveId(existing);
      } catch (e) {
        console.warn("[LiveSupportChat] Alice escalate sync failed", e);
      } finally {
        setSeeding(false);
      }
    })();
  }, [aliceConversationId, aliceMessages, aliceTitle]);

  useEffect(() => {
    const t = threadId ? threads.find((x) => x.id === threadId) : null;
    if (t?.unread_for_user) update.mutate({ id: t.id, patch: { unread_for_user: false } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, messages.length]);

  const busy = send.isPending || create.isPending || seeding;

  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setText("");
    try {
      if (!threadId) {
        const t = await create.mutateAsync({
          subject: body.slice(0, 80),
          body,
          channel: aliceConversationId ? "alice" : "chat",
        });
        setActiveId(t.id);
        return;
      }
      await send.mutateAsync({ threadId, body, role: "user" });
    } catch (e) {
      setText(body);
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 h-14 border-b shrink-0">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onBack} aria-label="Back to Alice">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Headphones className="h-4 w-4" />
        </div>
        <div className="leading-tight flex-1">
          <div className="font-semibold text-sm">Support</div>
          <div className="text-xs text-muted-foreground">
            {aliceConversationId
              ? "Alice handoff · replies show in Support"
              : "We usually reply within a day"}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4">
        <div className="py-4 space-y-3">
          {seeding && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving Alice conversation to your Support record…
            </div>
          )}
          {messages.length === 0 && !seeding && (
            <div className="text-sm text-muted-foreground">
              Send a message and our team will reply here — you&apos;ll see responses in real time.
              This conversation also appears under Support (envelope icon).
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.sender_role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                  m.sender_role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {m.sender_role === "staff" && (
                  <div className="text-[10px] font-semibold text-primary mb-0.5">Support</div>
                )}
                {m.body}
                <div
                  className={cn(
                    "text-[10px] mt-1",
                    m.sender_role === "user" ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="p-3 flex items-center gap-2 border-t shrink-0"
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message support…"
          disabled={busy}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Send">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
