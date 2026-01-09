import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  UserPlus, 
  Mail, 
  Link2, 
  CheckCircle2, 
  Clock, 
  Copy,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface PortalAccessPanelProps {
  customerId: string;
  customerEmail?: string | null;
}

export const PortalAccessPanel = ({ customerId, customerEmail }: PortalAccessPanelProps) => {
  const queryClient = useQueryClient();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState(customerEmail || '');

  // Check existing portal access
  const { data: portalAccess, isLoading } = useQuery({
    queryKey: ['customer-portal-access', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_portal_access')
        .select('*')
        .eq('customer_id', customerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Create portal access mutation
  const createAccessMutation = useMutation({
    mutationFn: async (email: string) => {
      // First, check if user exists with this email
      // Note: In production, you'd want to send an invite email via edge function
      // For now, we'll create the access record that the user can claim after signup
      
      // Generate a temporary access token
      const accessToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 day expiry

      const { error } = await supabase.from('customer_portal_access').insert({
        customer_id: customerId,
        access_token: accessToken,
        token_expires_at: expiresAt.toISOString(),
        is_active: true,
      });

      if (error) throw error;

      // Update customer email if different
      if (email !== customerEmail) {
        await supabase
          .from('customers')
          .update({ email })
          .eq('id', customerId);
      }

      return { accessToken };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-portal-access', customerId] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Portal access created. Send the invite link to the customer.');
      setIsInviteOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Toggle access status
  const toggleAccessMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      const { error } = await supabase
        .from('customer_portal_access')
        .update({ is_active: isActive })
        .eq('customer_id', customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-portal-access', customerId] });
      toast.success('Portal access updated');
    },
  });

  const handleInvite = () => {
    if (!inviteEmail) {
      toast.error('Please enter an email address');
      return;
    }
    createAccessMutation.mutate(inviteEmail);
  };

  const portalUrl = `${window.location.origin}/portal`;
  
  const copyInviteLink = () => {
    if (portalAccess?.access_token) {
      navigator.clipboard.writeText(`${portalUrl}?token=${portalAccess.access_token}`);
      toast.success('Invite link copied to clipboard');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          Loading portal access...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Customer Portal Access</CardTitle>
        {!portalAccess && (
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="w-4 h-4 mr-2" />
                Grant Access
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Grant Portal Access</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Create portal access for this customer. They will be able to complete 
                  their onboarding, upload documents, and track their verification status.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="email">Customer Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="customer@example.com"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsInviteOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleInvite} disabled={createAccessMutation.isPending}>
                    <Mail className="w-4 h-4 mr-2" />
                    Create Access
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {portalAccess ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${portalAccess.is_active ? 'bg-primary/10' : 'bg-muted'}`}>
                  {portalAccess.is_active ? (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  ) : (
                    <Clock className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="font-medium">Portal Access</p>
                  <p className="text-sm text-muted-foreground">
                    {portalAccess.user_id 
                      ? 'Customer has logged in' 
                      : 'Awaiting customer login'}
                  </p>
                </div>
              </div>
              <Badge variant={portalAccess.is_active ? 'default' : 'secondary'}>
                {portalAccess.is_active ? 'Active' : 'Disabled'}
              </Badge>
            </div>

            {portalAccess.last_login_at && (
              <p className="text-sm text-muted-foreground">
                Last login: {format(new Date(portalAccess.last_login_at), 'MMM d, yyyy h:mm a')}
              </p>
            )}

            <div className="flex items-center gap-2">
              <div className="flex-1 p-2 rounded bg-muted font-mono text-xs truncate">
                {portalUrl}
              </div>
              <Button size="icon" variant="outline" onClick={copyInviteLink}>
                <Copy className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="outline" asChild>
                <a href={portalUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant={portalAccess.is_active ? 'destructive' : 'default'}
                size="sm"
                onClick={() => toggleAccessMutation.mutate(!portalAccess.is_active)}
              >
                {portalAccess.is_active ? 'Disable Access' : 'Enable Access'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Link2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No portal access configured</p>
            <p className="text-sm">Click "Grant Access" to allow this customer to self-onboard</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
