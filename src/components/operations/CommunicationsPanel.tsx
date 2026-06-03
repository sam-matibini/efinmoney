import { useState } from "react";
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
  MessageSquare, 
  Plus,
  Mail,
  Phone,
  MessageCircle,
  Bell,
  Send,
  Search,
  ArrowUpRight,
  ArrowDownLeft
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const channelConfig: Record<string, { icon: typeof Mail; color: string; label: string }> = {
  email: { icon: Mail, color: 'bg-blue-500/10 text-blue-600', label: 'Email' },
  sms: { icon: MessageCircle, color: 'bg-indigo-500/10 text-indigo-600', label: 'SMS' },
  in_app: { icon: Bell, color: 'bg-purple-500/10 text-purple-600', label: 'In-App' },
  whatsapp: { icon: MessageCircle, color: 'bg-indigo-500/10 text-indigo-600', label: 'WhatsApp' },
  push: { icon: Bell, color: 'bg-amber-500/10 text-amber-600', label: 'Push' },
  phone_call: { icon: Phone, color: 'bg-orange-500/10 text-orange-600', label: 'Phone Call' },
};

const statusConfig: Record<string, { color: string }> = {
  draft: { color: 'bg-muted text-muted-foreground' },
  scheduled: { color: 'bg-blue-500/10 text-blue-600' },
  sent: { color: 'bg-indigo-500/10 text-indigo-600' },
  delivered: { color: 'bg-indigo-500/10 text-indigo-600' },
  failed: { color: 'bg-red-500/10 text-red-600' },
  read: { color: 'bg-purple-500/10 text-purple-600' },
};

export const CommunicationsPanel = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    channel: 'email',
    subject: '',
    content: '',
    customer_id: '',
  });

  const { data: communications = [], isLoading } = useQuery({
    queryKey: ['customer-communications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_communications')
        .select('*, customers(name, email)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('id, name, email').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const createCommunication = useMutation({
    mutationFn: async (data: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('customer_communications').insert({
        ...data,
        direction: 'outbound',
        status: 'sent',
        sent_at: new Date().toISOString(),
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-communications'] });
      toast.success('Message sent successfully');
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const resetForm = () => {
    setFormData({
      channel: 'email',
      subject: '',
      content: '',
      customer_id: '',
    });
  };

  const filteredCommunications = communications.filter(c => 
    c.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              <DialogContent className="max-w-lg">
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
                          {Object.entries(channelConfig).map(([key, config]) => (
                            <SelectItem key={key} value={key}>{config.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Customer</Label>
                      <Select value={formData.customer_id} onValueChange={(v) => setFormData({ ...formData, customer_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                        <SelectContent>
                          {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {formData.channel === 'email' && (
                    <div className="space-y-2">
                      <Label>Subject</Label>
                      <Input
                        value={formData.subject}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                        placeholder="Email subject..."
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Message</Label>
                    <Textarea
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      placeholder="Type your message..."
                      rows={4}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                    <Button
                      onClick={() => createCommunication.mutate(formData)}
                      disabled={!formData.content || createCommunication.isPending}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Send
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
                  <TableHead>Customer</TableHead>
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
                    
                    return (
                      <TableRow key={comm.id}>
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
                        <TableCell>{comm.customers?.name || '-'}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {comm.subject || comm.content?.slice(0, 50)}...
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
    </div>
  );
};
