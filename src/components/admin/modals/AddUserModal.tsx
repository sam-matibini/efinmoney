import { useState } from "react";
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

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLES = ['user', 'admin', 'compliance', 'support', 'finance'] as const;
const KYC_STATUSES = ['pending', 'submitted', 'verified', 'rejected', 'expired'] as const;
const KYC_TIERS = ['tier_0', 'tier_1', 'tier_2', 'tier_3'] as const;

const AddUserModal = ({ isOpen, onClose }: AddUserModalProps) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    phoneNumber: '',
    countryCode: '',
    kycStatus: 'pending' as typeof KYC_STATUSES[number],
    kycTier: 'tier_0' as typeof KYC_TIERS[number],
    riskScore: 0,
    roles: [] as string[],
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Create a profile entry (user_id will be set when they authenticate)
      // For admin-created users, we create a placeholder profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: crypto.randomUUID(), // Placeholder until actual auth
          email: data.email,
          full_name: data.fullName,
          phone_number: data.phoneNumber || null,
          country_code: data.countryCode || null,
          kyc_status: data.kycStatus,
          kyc_tier: data.kycTier,
          risk_score: data.riskScore,
        })
        .select()
        .single();

      if (profileError) throw profileError;

      // Add roles if any
      if (data.roles.length > 0 && profile) {
        const roleInserts = data.roles.map(role => ({
          user_id: profile.user_id,
          role: role as 'user' | 'admin' | 'compliance' | 'support' | 'finance',
        }));

        const { error: rolesError } = await supabase
          .from('user_roles')
          .insert(roleInserts);

        if (rolesError) throw rolesError;
      }

      return profile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      toast.success('User created successfully');
      handleClose();
    },
    onError: (error) => {
      console.error('Error creating user:', error);
      toast.error('Failed to create user');
    },
  });

  const handleClose = () => {
    setFormData({
      email: '',
      fullName: '',
      phoneNumber: '',
      countryCode: '',
      kycStatus: 'pending',
      kycTier: 'tier_0',
      riskScore: 0,
      roles: [],
    });
    onClose();
  };

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
    if (!formData.email) {
      toast.error('Email is required');
      return;
    }
    createUserMutation.mutate(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                  placeholder="John Doe"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                  placeholder="+1 234 567 8900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="countryCode">Country Code</Label>
                <Input
                  id="countryCode"
                  value={formData.countryCode}
                  onChange={(e) => setFormData(prev => ({ ...prev, countryCode: e.target.value }))}
                  placeholder="US"
                  maxLength={2}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>KYC Status</Label>
                <Select
                  value={formData.kycStatus}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, kycStatus: value as typeof formData.kycStatus }))}
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
                  onValueChange={(value) => setFormData(prev => ({ ...prev, kycTier: value as typeof formData.kycTier }))}
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
                <Label htmlFor="riskScore">Risk Score</Label>
                <Input
                  id="riskScore"
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
                      id={`role-${role}`}
                      checked={formData.roles.includes(role)}
                      onCheckedChange={() => handleRoleToggle(role)}
                    />
                    <label
                      htmlFor={`role-${role}`}
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
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createUserMutation.isPending}>
              {createUserMutation.isPending ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddUserModal;
