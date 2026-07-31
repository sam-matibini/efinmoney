import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Send, Mail, Phone, MessageCircle, Bell, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AttachmentLinks,
  AttachmentPicker,
  useCommunicationAttachments,
} from "@/components/crm/CommunicationAttachments";
import { sendCommunication, type StagedAttachment } from "@/lib/communications";

interface Props {
  customerId: string;
}

const CHANNELS = [
  { value: "email",       label: "Email",       icon: Mail,          color: "bg-blue-500/10 text-blue-600" },
  { value: "sms",         label: "SMS",         icon: MessageCircle, color: "bg-indigo-500/10 text-indigo-600" },
  { value: "in_app",      label: "In-App",      icon: Bell,          color: "bg-purple-500/10 text-purple-600" },
  { value: "whatsapp",    label: "WhatsApp",    icon: MessageCircle, color: "bg-emerald-500/10 text-emerald-600" },
  { value: "phone_call",  label: "Phone Call",  icon: Phone,         color: "bg-orange-500/10 text-orange-600" },
];

const STATUS_COLOR: Record<string, string> = {
  sent:      "bg-indigo-500/10 text-indigo-600",
  delivered: "bg-indigo-500/10 text-indigo-600",
  read:      "bg-purple-500/10 text-purple-600",
  failed:    "bg-red-500/10 text-red-600",
  draft:     "bg-muted text-muted-foreground",
};

export const CustomerCommunicationsPanel = ({ customerId }: Props) => {
  const qc = useQueryClient();
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<StagedAttachment[]>([]);

  const { data: customer } = useQuery({
    queryKey: ["customer-contact", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("name, email")
        .eq("id", customerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: comms = [], isLoading } = useQuery({
    queryKey: ["customer-comms", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_communications")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!content.trim()) throw new Error("Message is required");
      if (channel === "email" && !customer?.email) {
        throw new Error("This customer has no email address on file");
      }
      await sendCommunication({
        channel,
        subject: channel === "email" ? subject : "",
        content: content.trim(),
        customer_id: customerId,
        recipient_email: customer?.email ?? null,
        recipient_name: customer?.name ?? null,
        attachments: files,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-comms", customerId] });
      qc.invalidateQueries({ queryKey: ["customer-communications"] });
      qc.invalidateQueries({ queryKey: ["communication-attachments"] });
      toast.success(channel === "email" ? "Message sent" : "Interaction recorded");
      setSubject("");
      setContent("");
      setFiles([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: attachmentsByComm = {} } = useCommunicationAttachments(
    comms.map((c: { id: string }) => c.id),
  );

  const channelCfg = (ch: string) => CHANNELS.find((c) => c.value === ch) ?? CHANNELS[0];

  return (
    <div className="space-y-4">
      {/* Compose */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="w-4 h-4" /> New Message
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {channel === "email" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Subject</Label>
                <Input
                  className="h-8"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject…"
                />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Message</Label>
            <Textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type your message…"
              className="text-sm resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Documents</Label>
            <AttachmentPicker files={files} onChange={setFiles} disabled={send.isPending} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {channel === "email"
                ? customer?.email
                  ? `Sends to ${customer.email}`
                  : "No email on file for this customer"
                : "No provider connected — recorded on the customer timeline"}
            </p>
            <Button
              size="sm"
              disabled={!content.trim() || send.isPending}
              onClick={() => send.mutate()}
              className="gap-1.5"
            >
              <Send className="w-4 h-4" />
              {send.isPending ? "Sending…" : "Send"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Message History ({comms.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : comms.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No messages yet</p>
          ) : (
            <ul className="divide-y divide-border">
              {comms.map((c: any) => {
                const cfg = channelCfg(c.channel);
                const Icon = cfg.icon;
                return (
                  <li key={c.id} className="py-3 flex items-start gap-3">
                    <Badge className={`${cfg.color} shrink-0 mt-0.5`}>
                      <Icon className="w-3 h-3 mr-1" />{cfg.label}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      {c.subject && (
                        <p className="text-sm font-medium truncate">{c.subject}</p>
                      )}
                      <p className="text-xs text-muted-foreground line-clamp-2">{c.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(c.created_at), "MMM d, yyyy HH:mm")}
                        </span>
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLOR[c.status] ?? ""}`}>
                          {c.status}
                        </Badge>
                      </div>
                      <AttachmentLinks attachments={attachmentsByComm[c.id] || []} />
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {c.direction === "outbound"
                        ? <><ArrowUpRight className="w-3 h-3 mr-1 inline" />Out</>
                        : <><ArrowDownLeft className="w-3 h-3 mr-1 inline" />In</>}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
