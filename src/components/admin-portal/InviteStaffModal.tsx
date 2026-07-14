import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import LoadingSpinner from "@/components/LoadingSpinner";
import { toast } from "sonner";
import type { AdminRole } from "@/contexts/AdminAuthContext";

const ROLE_OPTIONS: { value: AdminRole; label: string; hint: string }[] = [
  { value: "compliance_officer", label: "Compliance Officer", hint: "KYC review, user & risk management, audit log" },
  { value: "finance_officer", label: "Finance Officer", hint: "Treasury, transfers, payouts, FX, reconciliation" },
  { value: "support_agent", label: "Support Agent", hint: "View users and add internal notes" },
  { value: "viewer", label: "Viewer", hint: "Read-only dashboards and audit log" },
  { value: "super_admin", label: "Super Admin", hint: "Full access incl. staff management & settings" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const InviteStaffModal = ({ open, onOpenChange }: Props) => {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AdminRole>("compliance_officer");
  const [department, setDepartment] = useState("");

  const { data: departments = [] } = useQuery({
    queryKey: ["admin-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-invite-staff", {
        body: {
          email: email.trim().toLowerCase(),
          full_name: fullName.trim(),
          role,
          department: department || undefined,
          redirect_to: `${import.meta.env.VITE_APP_URL || window.location.origin}/admin/onboarding`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-staff-list"] });
      toast.success("Invitation sent");
      setEmail("");
      setFullName("");
      setRole("compliance_officer");
      setDepartment("");
      onOpenChange(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to invite staff"),
  });

  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && fullName.trim().length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite staff member</DialogTitle>
          <DialogDescription>
            They will receive an email invite to set a password, complete their profile, and upload an ID document for review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="staff-name">Full name</Label>
            <Input
              id="staff-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-email">Work email</Label>
            <Input
              id="staff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@efin.money"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AdminRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {ROLE_OPTIONS.find((r) => r.value === role)?.hint}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No department</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => invite.mutate()} disabled={!valid || invite.isPending}>
            {invite.isPending && <LoadingSpinner size={16} className="mr-2" />}
            Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InviteStaffModal;
