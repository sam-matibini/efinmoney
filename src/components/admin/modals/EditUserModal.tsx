import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
}

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  currentRoles: string[];
}

const ROLES = ['user', 'admin', 'compliance', 'support', 'finance'] as const;
const KYC_STATUSES = ['pending', 'submitted', 'verified', 'rejected', 'expired'] as const;
const KYC_TIERS = ['tier_0', 'tier_1', 'tier_2', 'tier_3'] as const;

const EditUserModal = ({ isOpen, onClose, user, currentRoles }: EditUserModalProps) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    fullName: '',
    phoneNumber: '',
    countryCode: '',
    kycStatus: 'pending' as string,
    kycTier: 'tier_0' as string,
    riskScore: 0,
    roles: [] as string[],
  });

  useEffect(() => {
    if (user) {
      setFormData({
        fullName: user.full_name || '',
        phoneNumber: user.phone_number || '',
        countryCode: user.country_code || '',
        kycStatus: user.kyc_status || 'pending',
        kycTier: user.kyc_tier || 'tier_0',
        riskScore: user.risk_score || 0,
        roles: currentRoles,
      });
    }
  }, [user, currentRoles]);

  const updateUserMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!user) throw new Error('No user selected');

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: data.fullName || null,
          phone_number: data.phoneNumber || null,
          country_code: data.countryCode || null,
          kyc_status: data.kycStatus as 'pending' | 'submitted' | 'verified' | 'rejected' | 'expired',
          kyc_tier: data.kycTier as 'tier_0' | 'tier_1' | 'tier_2' | 'tier_3',
          risk_score: data.riskScore,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // Update roles - delete existing and add new ones
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', user.user_id);

      if (deleteError) throw deleteError;

      if (data.roles.length > 0) {
        const roleInserts = data.roles.map(role => ({
          user_id: user.user_id,
          role: role as 'user' | 'admin' | 'compliance' | 'support' | 'finance',
        }));

        const { error: rolesError } = await supabase
          .from('user_roles')
          .insert(roleInserts);

        if (rolesError) throw rolesError;
      }

      return user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      toast.success('User updated successfully');
      onClose();
    },
    onError: (error) => {
      console.error('Error updating user:', error);
      toast.error('Failed to update user');
    },
  });

  const handleRoleToggle = (role: string) => {
    setFormData(prev => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserMutation.mutate(formData);
  };

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={user.avatar_url || undefined} />
              <AvatarFallback>
                {(user.full_name || user.email || 'U').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <span>Edit User</span>
              <p className="text-sm font-normal text-muted-foreground">{user.email}</p>
            </div>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-fullName">Full Name</Label>
                <Input
                  id="edit-fullName"
                  value={formData.fullName}
                  onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phoneNumber">Phone Number</Label>
                <Input
                  id="edit-phoneNumber"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                  placeholder="+1 234 567 8900"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>KYC Status</Label>
                <Select
                  value={formData.kycStatus}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, kycStatus: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KYC_STATUSES.map(status => (
                      <SelectItem key={status} value={status}>
                        {status.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>KYC Tier</Label>
                <Select
                  value={formData.kycTier}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, kycTier: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KYC_TIERS.map(tier => (
                      <SelectItem key={tier} value={tier}>
                        {tier.replace('_', ' ').toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-riskScore">Risk Score</Label>
                <Input
                  id="edit-riskScore"
                  type="number"
                  min={0}
                  max={100}
                  value={formData.riskScore}
                  onChange={(e) => setFormData(prev => ({ ...prev, riskScore: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-4">
                {ROLES.map(role => (
                  <div key={role} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-role-${role}`}
                      checked={formData.roles.includes(role)}
                      onCheckedChange={() => handleRoleToggle(role)}
                    />
                    <label
                      htmlFor={`edit-role-${role}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 capitalize"
                    >
                      {role}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateUserMutation.isPending}>
              {updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditUserModal;
