import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const kycStatusColors: Record<string, string> = {
  verified: 'bg-green-500/10 text-green-500',
  pending: 'bg-yellow-500/10 text-yellow-500',
  rejected: 'bg-red-500/10 text-red-500',
  not_started: 'bg-muted text-muted-foreground',
};

export const UsersPanel = () => {
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          user_id,
          email,
          full_name,
          phone_number,
          country_code,
          kyc_status,
          kyc_tier,
          risk_score,
          avatar_url,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ['all-user-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (error) throw error;
      return data || [];
    },
  });

  const getRolesForUser = (userId: string) => {
    return userRoles.filter(r => r.user_id === userId).map(r => r.role);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users ({profiles.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>KYC Status</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Risk Score</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                profiles.map((profile) => {
                  const roles = getRolesForUser(profile.user_id);
                  return (
                    <TableRow key={profile.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={profile.avatar_url || undefined} />
                            <AvatarFallback>
                              {(profile.full_name || profile.email || 'U').charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{profile.full_name || 'No name'}</p>
                            <p className="text-xs text-muted-foreground">{profile.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={kycStatusColors[profile.kyc_status] || kycStatusColors.pending}>
                          {profile.kyc_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{profile.kyc_tier}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className={profile.risk_score && profile.risk_score > 50 ? 'text-red-500' : ''}>
                          {profile.risk_score || 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {roles.length > 0 ? (
                            roles.map(role => (
                              <Badge key={role} variant="secondary" className="text-xs">
                                {role}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {format(new Date(profile.created_at), 'MMM d, yyyy')}
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
  );
};
