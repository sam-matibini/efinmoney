import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  MessageSquare,
  Plus,
  Mail,
  Phone,
  MessageCircle,
  Bell,
  Send,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronsUpDown,
  Check,
  Paperclip,
  Loader2,
  StickyNote,
  CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCommunicationRecipients, type CommunicationRecipient } from "@/hooks/useCommunicationRecipients";
import {
  AttachmentLinks,
  AttachmentPicker,
  useCommunicationAttachments,
} from "@/components/crm/CommunicationAttachments";
import { CHANNELS, sendCommunication, type StagedAttachment } from "@/lib/communications";

const channelConfig: Record<string, { icon: typeof Mail; color: string; label: string }> = {
  email: { icon: Mail, color: 'bg-blue-500/10 text-blue-600', label: 'Email' },
  sms: { icon: MessageCircle, color: 'bg-indigo-500/10 text-indigo-600', label: 'SMS' },
  in_app: { icon: Bell, color: 'bg-purple-500/10 text-purple-600', label: 'In-App' },
  whatsapp: { icon: MessageCircle, color: 'bg-indigo-500/10 text-indigo-600', label: 'WhatsApp' },
  push: { icon: Bell, color: 'bg-amber-500/10 text-amber-600', label: 'Push' },
  phone_call: { icon: Phone, color: 'bg-orange-500/10 text-orange-600', label: 'Phone Call' },
  meeting: { icon: CalendarClock, color: 'bg-teal-500/10 text-teal-600', label: 'Meeting' },
  note: { icon: StickyNote, color: 'bg-slate-500/10 text-slate-600', label: 'Note' },
};

const statusConfig: Record<string, { color: string }> = {
  draft: { color: 'bg-muted text-muted-foreground' },
  logged: { color: 'bg-slate-500/10 text-slate-600' },
  scheduled: { color: 'bg-blue-500/10 text-blue-600' },
  sent: { color: 'bg-indigo-500/10 text-indigo-600' },
  delivered: { color: 'bg-indigo-500/10 text-indigo-600' },
  failed: { color: 'bg-red-500/10 text-red-600' },
  read: { color: 'bg-purple-500/10 text-purple-600' },
};

interface CommunicationRow {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  content: string;
  status: string;
  created_at: string;
  recipient_email: string | null;
  recipient_name: string | null;
  error_message: string | null;
  customers?: { name: string | null; email: string | null } | null;
}

const emptyForm = {
  channel: 'email',
  subject: '',
  content: '',
  recipientKey: '',
  manualEmail: '',
};

export const CommunicationsPanel = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [recipientOpen, setRecipientOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [files, setFiles] = useState<StagedAttachment[]>([]);
  const [detail, setDetail] = useState<CommunicationRow | null>(null);

  const { data: communications = [], isLoading } = useQuery({
    queryKey: ['customer-communications'],
    queryFn: async (): Promise<CommunicationRow[]> => {
      const { data, error } = await supabase
        .from('customer_communications')
        .select('*, customers(name, email)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as CommunicationRow[];
    },
  });

  const { data: recipients = [] } = useCommunicationRecipients();
  const communicationIds = useMemo(() => communications.map((c) => c.id), [communications]);
  const { data: attachmentsByComm = {} } = useCommunicationAttachments(communicationIds);

  const selected: CommunicationRecipient | undefined = recipients.find((r) => r.key === formData.recipientKey);
  const channelMeta = CHANNELS[formData.channel];
  const resolvedEmail = (formData.manualEmail || selected?.email || '').trim();

  const send = useMutation({
    mutationFn: async () => {
      await sendCommunication({
        channel: formData.channel,
        subject: formData.subject,
        content: formData.content,
        customer_id: selected?.customer_id ?? null,
        user_id: selected?.user_id ?? null,
        recipient_email: resolvedEmail || null,
        recipient_name: selected?.label ?? null,
        attachments: files,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-communications'] });
      queryClient.invalidateQueries({ queryKey: ['communication-attachments'] });
      toast.success(channelMeta?.delivery === 'live' ? 'Message sent' : 'Interaction recorded');
      setIsCreateOpen(false);
      setFormData(emptyForm);
      setFiles([]);
    },
    onError: (error: Error) => toast.error(error.message || 'Could not send message'),
  });

  const filteredCommunications = communications.filter((c) =>
    [c.subject, c.content, c.customers?.name, c.recipient_email, c.recipient_name]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  const canSend =
    !!formData.content.trim() &&
    (formData.channel !== 'email' || (!!resolvedEmail && !!formData.subject.trim())) &&
    (formData.channel !== 'in_app' || !!selected?.user_id);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Communications</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{communications.length}</p>
                <p className="text-xs text-muted-foreground">Total Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{communications.filter(c => c.channel === 'email').length}</p>
                <p className="text-xs text-muted-foreground">Emails</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5 text-indigo-500" />
              <div>
                <p className="text-2xl font-bold">{communications.filter(c => c.direction === 'outbound').length}</p>
                <p className="text-xs text-muted-foreground">Outbound</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{communications.filter(c => c.direction === 'inbound').length}</p>
                <p className="text-xs text-muted-foreground">Inbound</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Communication Hub
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-48"
              />
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 mr-2" />New Message</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Send Message</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Channel</Label>
                      <Select value={formData.channel} onValueChange={(v) => setFormData({ ...formData, channel: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(CHANNELS).map(([key, meta]) => (
                            <SelectItem key={key} value={key}>
                              <span className="flex items-center gap-2">
                                {meta.label}
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px] px-1.5 py-0",
                                    meta.delivery === 'live' ? 'text-indigo-600' : 'text-muted-foreground',
                                  )}
                                >
                                  {meta.delivery === 'live' ? 'Live' : 'Logged'}
                                </Badge>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Recipient</Label>
                      <Popover open={recipientOpen} onOpenChange={setRecipientOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                            <span className="truncate">{selected?.label || 'Select recipient'}</span>
                            <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[320px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search users and customers..." />
                            <CommandList>
                              <CommandEmpty>No match found.</CommandEmpty>
                              <CommandGroup>
                                {recipients.map((r) => (
                                  <CommandItem
                                    key={r.key}
                                    value={`${r.label} ${r.email ?? ''}`}
                                    onSelect={() => {
                                      setFormData((f) => ({ ...f, recipientKey: r.key }));
                                      setRecipientOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        formData.recipientKey === r.key ? "opacity-100" : "opacity-0",
                                      )}
                                    />
                                    <span className="flex-1 truncate">
                                      {r.label}
                                      {r.email && (
                                        <span className="block text-xs text-muted-foreground truncate">{r.email}</span>
                                      )}
                                    </span>
                                    <Badge variant="outline" className="ml-2 text-[10px]">
                                      {r.source === 'user' ? 'App user' : 'Customer'}
                                    </Badge>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {channelMeta?.note && (
                    <p className="text-xs text-muted-foreground">{channelMeta.note}</p>
                  )}

                  {formData.channel === 'email' && (
                    <>
                      <div className="space-y-2">
                        <Label>Send to</Label>
                        <Input
                          value={formData.manualEmail || selected?.email || ''}
                          onChange={(e) => setFormData({ ...formData, manualEmail: e.target.value })}
                          placeholder="name@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Subject</Label>
                        <Input
                          value={formData.subject}
                          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                          placeholder="Email subject..."
                        />
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <Label>Message</Label>
                    <Textarea
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      placeholder="Type your message..."
                      rows={5}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Documents</Label>
                    <AttachmentPicker files={files} onChange={setFiles} disabled={send.isPending} />
                    {files.length > 0 && formData.channel === 'email' && (
                      <p className="text-xs text-muted-foreground">
                        Recipients get secure download links that expire in 7 days.
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                    <Button onClick={() => send.mutate()} disabled={!canSend || send.isPending}>
                      {send.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      {channelMeta?.delivery === 'live' ? 'Send' : 'Record'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Subject/Content</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCommunications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No communications found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCommunications.map((comm) => {
                    const channelCfg = channelConfig[comm.channel] || channelConfig.email;
                    const ChannelIcon = channelCfg.icon;
                    const attachmentCount = (attachmentsByComm[comm.id] || []).length;

                    return (
                      <TableRow
                        key={comm.id}
                        className="cursor-pointer"
                        onClick={() => setDetail(comm)}
                      >
                        <TableCell>
                          <Badge className={channelCfg.color}>
                            <ChannelIcon className="w-3 h-3 mr-1" />
                            {channelCfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {comm.direction === 'outbound' ? (
                            <Badge variant="outline" className="text-indigo-600">
                              <ArrowUpRight className="w-3 h-3 mr-1" />
                              Out
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-purple-600">
                              <ArrowDownLeft className="w-3 h-3 mr-1" />
                              In
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate">
                          {comm.customers?.name || comm.recipient_name || comm.recipient_email || '-'}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          <span className="flex items-center gap-2">
                            {attachmentCount > 0 && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Paperclip className="w-3 h-3" />
                                {attachmentCount}
                              </span>
                            )}
                            <span className="truncate">{comm.subject || comm.content?.slice(0, 60)}</span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusConfig[comm.status]?.color || ''}>
                            {comm.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(comm.created_at), 'MMM dd, HH:mm')}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.subject || channelConfig[detail?.channel || 'email']?.label}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={statusConfig[detail.status]?.color || ''}>{detail.status}</Badge>
                <span className="text-muted-foreground">
                  {format(new Date(detail.created_at), 'PPp')}
                </span>
              </div>
              {(detail.recipient_email || detail.recipient_name) && (
                <p className="text-muted-foreground">
                  To: {detail.recipient_name}{detail.recipient_email ? ` · ${detail.recipient_email}` : ''}
                </p>
              )}
              <p className="whitespace-pre-wrap">{detail.content}</p>
              {detail.error_message && (
                <p className="rounded-md bg-red-500/10 px-3 py-2 text-red-600">{detail.error_message}</p>
              )}
              <AttachmentLinks attachments={attachmentsByComm[detail.id] || []} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
