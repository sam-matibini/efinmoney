import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Mail, Phone, Eye, Search, Shield, CheckCircle2, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";
import EditUserModal from "@/components/admin/modals/EditUserModal";

interface UserProfile {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone_number: string | null;
  country_code: string | null;
  kyc_status: string;
  kyc_tier: string;
  risk_score: number | null;
  avatar_url: string | null;
  account_number: string | null;
  efin_tag: string | null;
  created_at: string;
}

const kycStatusConfig: Record<string, { icon: typeof Clock; color: 'default' | 'secondary' | 'destructive'; label: string }> = {
  verified:    { icon: CheckCircle2, color: 'default',     label: 'Verified' },
  approved:    { icon: CheckCircle2, color: 'default',     label: 'Approved' },
  pending:     { icon: Clock,        color: 'secondary',   label: 'Pending' },
  in_review:   { icon: Clock,        color: 'secondary',   label: 'In Review' },
  submitted:   { icon: Clock,        color: 'secondary',   label: 'Submitted' },
  rejected:    { icon: XCircle,      color: 'destructive', label: 'Rejected' },
  not_started: { icon: Clock,        color: 'secondary',   label: 'Not Started' },
};

const riskLabel = (score: number | null): { label: string; className: string } => {
  if (score === null) return { label: 'Unknown', className: 'border-muted text-muted-foreground' };
  if (score >= 70) return { label: 'High',   className: 'border-red-500 text-red-600' };
  if (score >= 40) return { label: 'Medium', className: 'border-amber-500 text-amber-600' };
  return                  { label: 'Low',    className: 'border-indigo-500 text-indigo-600' };
};

export const CrmCustomersPanel = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editUser, setEditUser] = useState<UserProfile | null>(null);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['crm-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, email, full_name, phone_number, country_code, kyc_status, kyc_tier, risk_score, avatar_url, account_number, efin_tag, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as UserProfile[];
    },
  });

  const filtered = profiles.filter(p => {
    const q = searchTerm.toLowerCase();
    return (
      p.full_name?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.phone_number?.includes(q) ||
      p.account_number?.includes(q) ||
      p.efin_tag?.toLowerCase().includes(q)
    );
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>CRM - Customers</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            CRM - Customers
            <Badge variant="secondary" className="ml-1">{profiles.length}</Badge>
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>KYC Status</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {searchTerm ? 'No customers match your search' : 'No customers found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((profile) => {
                    const kyc = kycStatusConfig[profile.kyc_status] || kycStatusConfig.pending;
                    const KycIcon = kyc.icon;
                    const risk = riskLabel(profile.risk_score);
                    const initials = (profile.full_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

                    return (
                      <TableRow key={profile.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={profile.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{profile.full_name || '—'}</p>
                              <p className="text-xs text-muted-foreground">
                                {profile.efin_tag ? `@${profile.efin_tag}` : profile.account_number || ''}
                                {profile.country_code ? ` · ${profile.country_code}` : ''}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5 text-sm">
                            {profile.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3 shrink-0" />{profile.email}</span>}
                            {profile.phone_number && <span className="flex items-center gap-1"><Phone className="w-3 h-3 shrink-0" />{profile.phone_number}</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={kyc.color} className="flex items-center gap-1 w-fit">
                            <KycIcon className="w-3 h-3" />
                            {kyc.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm capitalize">{profile.kyc_tier || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={risk.className}>
                            <Shield className="w-3 h-3 mr-1" />
                            {risk.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(profile.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditUser(profile)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
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

      <EditUserModal
        isOpen={editUser !== null}
        user={editUser}
        onClose={() => setEditUser(null)}
        currentRoles={[]}
      />
    </>
  );
};
