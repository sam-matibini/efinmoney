import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Users, 
  Plus,
  Shield,
  Trash2,
  Search,
  UserCog
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const roleConfig: Record<string, { color: string; description: string }> = {
  admin: { color: 'bg-red-500/10 text-red-600', description: 'Full system access' },
  compliance: { color: 'bg-purple-500/10 text-purple-600', description: 'Compliance & AML operations' },
  finance: { color: 'bg-blue-500/10 text-blue-600', description: 'Finance & accounting access' },
  support: { color: 'bg-indigo-500/10 text-indigo-600', description: 'Customer support operations' },
  user: { color: 'bg-muted text-muted-foreground', description: 'Standard user access' },
};

export const StaffManagementPanel = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [newRole, setNewRole] = useState<string>('');
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['all-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ['all-user-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const addRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase.from('user_roles').insert({
        user_id: userId,
        role: role as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      toast.success('Role added successfully');
      setIsAddRoleOpen(false);
      setNewRole('');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const removeRole = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('id', roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      toast.success('Role removed successfully');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const getRolesForUser = (userId: string) => {
    return userRoles.filter(r => r.user_id === userId);
  };

  const filteredProfiles = profiles.filter(p => 
    p.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const staffCount = profiles.filter(p => {
    const roles = getRolesForUser(p.user_id);
    return roles.some(r => ['admin', 'compliance', 'finance', 'support'].includes(r.role));
  }).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Staff Management</CardTitle></CardHeader>
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
              <Users className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{profiles.length}</p>
                <p className="text-xs text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <UserCog className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{staffCount}</p>
                <p className="text-xs text-muted-foreground">Staff Members</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{userRoles.filter(r => r.role === 'admin').length}</p>
                <p className="text-xs text-muted-foreground">Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{userRoles.filter(r => r.role === 'compliance').length}</p>
                <p className="text-xs text-muted-foreground">Compliance</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Staff & Role Management
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-48"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>KYC Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfiles.map((profile) => {
                  const roles = getRolesForUser(profile.user_id);
                  
                  return (
                    <TableRow key={profile.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={profile.avatar_url || ''} />
                            <AvatarFallback>{profile.full_name?.slice(0, 2).toUpperCase() || 'U'}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{profile.full_name || 'Unknown'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{profile.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {roles.map((role) => (
                            <Badge key={role.id} className={roleConfig[role.role]?.color || ''}>
                              {role.role}
                            </Badge>
                          ))}
                          {roles.length === 0 && (
                            <Badge variant="outline" className="text-muted-foreground">No roles</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{profile.kyc_status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(profile.created_at), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => { setSelectedUser(profile); setIsAddRoleOpen(true); }}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Role
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Role Dialog */}
      <Dialog open={isAddRoleOpen} onOpenChange={(open) => { setIsAddRoleOpen(open); if (!open) setNewRole(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Roles for {selectedUser?.full_name || 'User'}</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              {/* Current Roles */}
              <div>
                <Label className="text-sm text-muted-foreground">Current Roles</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {getRolesForUser(selectedUser.user_id).map((role) => (
                    <Badge key={role.id} className={`${roleConfig[role.role]?.color || ''} pr-1`}>
                      {role.role}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-4 h-4 ml-1 hover:bg-transparent"
                        onClick={() => removeRole.mutate(role.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </Badge>
                  ))}
                  {getRolesForUser(selectedUser.user_id).length === 0 && (
                    <p className="text-sm text-muted-foreground">No roles assigned</p>
                  )}
                </div>
              </div>

              {/* Add New Role */}
              <div className="space-y-2">
                <Label>Add Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger><SelectValue placeholder="Select role to add" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(roleConfig).map(([role, config]) => (
                      <SelectItem key={role} value={role}>
                        <div>
                          <span className="font-medium">{role}</span>
                          <span className="text-xs text-muted-foreground ml-2">- {config.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsAddRoleOpen(false)}>Close</Button>
                <Button
                  onClick={() => addRole.mutate({ userId: selectedUser.user_id, role: newRole })}
                  disabled={!newRole || addRole.isPending}
                >
                  Add Role
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
