import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { kycApprovalOptionDetail, limitsFromTierRow, type KycTierKey } from "@/lib/kycLimitCopy";

export type ApprovalScope = "id_only" | "id_and_address";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: ApprovalScope;
  onScopeChange: (scope: ApprovalScope) => void;
  recipientEmail?: string | null;
  loading?: boolean;
  onConfirm: () => void;
};

export function ApproveVerificationDialog({
  open,
  onOpenChange,
  scope,
  onScopeChange,
  recipientEmail,
  loading = false,
  onConfirm,
}: Props) {
  const email = (recipientEmail || "").trim();
  const limitsQuery = useQuery({
    queryKey: ["approval-tier-limits"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tier_limits")
        .select("tier, daily_limit, monthly_limit, single_limit, features_enabled")
        .in("tier", ["tier_2", "tier_3"]);
      if (error) throw error;
      return data ?? [];
    },
  });
  const detail = (tier: KycTierKey) => {
    const row = limitsQuery.data?.find((item) => item.tier === tier);
    return kycApprovalOptionDetail(limitsFromTierRow(row, tier));
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve verification</DialogTitle>
          <DialogDescription>
            Choose the tier this approval grants.
            {email
              ? ` A notification email will be sent to ${email}.`
              : " A notification email will be sent to the user."}
          </DialogDescription>
        </DialogHeader>
        <RadioGroup
          value={scope}
          onValueChange={(value) => onScopeChange(value as ApprovalScope)}
          className="space-y-2"
        >
          <div className="flex items-start gap-3 p-3 border rounded-lg">
            <RadioGroupItem value="id_only" id="id_only" className="mt-1" />
            <Label htmlFor="id_only" className="flex-1 cursor-pointer">
              <div className="font-medium">Approve ID only — Tier 2</div>
              <div className="text-xs text-muted-foreground">{detail("tier_2")}</div>
            </Label>
          </div>
          <div className="flex items-start gap-3 p-3 border rounded-lg">
            <RadioGroupItem value="id_and_address" id="id_and_address" className="mt-1" />
            <Label htmlFor="id_and_address" className="flex-1 cursor-pointer">
              <div className="font-medium">Approve ID + Address — Tier 3</div>
              <div className="text-xs text-muted-foreground">{detail("tier_3")}</div>
            </Label>
          </div>
        </RadioGroup>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" className="min-w-64" onClick={onConfirm} disabled={loading}>
            {loading ? "Sending…" : "Approve & Send Notification Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
