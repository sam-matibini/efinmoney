import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface CardData {
  id: string;
  type: string;
  last_four: string;
  brand: string;
  status: string;
  currency: string;
  balance: number;
  expires: string;
  nickname?: string;
  dailyLimit?: number;
  monthlyLimit?: number;
  onlinePayments?: boolean;
  internationalPayments?: boolean;
}

interface EditCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: CardData | null;
  onSave: (cardId: string, data: Partial<CardData>) => void;
}

const EditCardModal = ({ isOpen, onClose, card, onSave }: EditCardModalProps) => {
  const [nickname, setNickname] = useState("");
  const [dailyLimit, setDailyLimit] = useState("5000");
  const [monthlyLimit, setMonthlyLimit] = useState("25000");
  const [onlinePayments, setOnlinePayments] = useState(true);
  const [internationalPayments, setInternationalPayments] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (card) {
      setNickname(card.nickname || "");
      setDailyLimit(String(card.dailyLimit || 5000));
      setMonthlyLimit(String(card.monthlyLimit || 25000));
      setOnlinePayments(card.onlinePayments ?? true);
      setInternationalPayments(card.internationalPayments ?? true);
    }
  }, [card]);

  const handleSave = async () => {
    if (!card) return;
    
    setIsSaving(true);
    try {
      onSave(card.id, {
        nickname,
        dailyLimit: Number(dailyLimit),
        monthlyLimit: Number(monthlyLimit),
        onlinePayments,
        internationalPayments,
      });
      toast.success("Card settings updated");
      onClose();
    } catch (error) {
      toast.error("Failed to update card");
    } finally {
      setIsSaving(false);
    }
  };

  if (!card) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            Edit Card •••• {card.last_four}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="card-nickname">Card Nickname</Label>
            <Input
              id="card-nickname"
              placeholder={`My ${card.brand} Card`}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="daily-limit">Daily Limit ($)</Label>
              <Input
                id="daily-limit"
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly-limit">Monthly Limit ($)</Label>
              <Input
                id="monthly-limit"
                type="number"
                value={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="online-payments">Online Payments</Label>
            <Switch
              id="online-payments"
              checked={onlinePayments}
              onCheckedChange={setOnlinePayments}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="international">International Payments</Label>
            <Switch
              id="international"
              checked={internationalPayments}
              onCheckedChange={setInternationalPayments}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditCardModal;
