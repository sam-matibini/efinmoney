import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, Link2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  createElicatePaymentLink,
  listElicatePaymentLinks,
  updateElicatePaymentLink,
  type ElicatePaymentLinkRow,
} from "@/lib/elicate";
import { useWallets } from "@/hooks/useWallets";
import { productFeatures } from "@/lib/productFeatures";

export default function ZambiaMoMoReceiveLinks() {
  const { data: wallets } = useWallets();
  const zmw = (wallets ?? []).find((w) => w.currency_code === "ZMW");
  const [links, setLinks] = useState<ElicatePaymentLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("ZMW payment");
  const [type, setType] = useState<"fixed" | "flexible">("fixed");
  const [amount, setAmount] = useState("50");
  const [minAmount, setMinAmount] = useState("10");

  const refresh = async () => {
    setLoading(true);
    try {
      setLinks(await listElicatePaymentLinks());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load payment links");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (productFeatures.elicate) void refresh();
  }, []);

  if (!productFeatures.elicate) return null;
  if (!zmw) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zambia mobile money links</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Open a ZMW wallet first, then create a shareable MoMo payment link.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createElicatePaymentLink({
        name: name.trim() || "ZMW payment",
        type,
        amount: type === "fixed" ? Number(amount) : undefined,
        min_amount: type === "flexible" ? Number(minAmount) : undefined,
        wallet_id: zmw.wallet_id,
      });
      toast.success("Payment link created");
      setShowForm(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create link");
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (url: string | null) => {
    if (!url) return toast.error("No URL yet");
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  const toggleActive = async (link: ElicatePaymentLinkRow) => {
    try {
      await updateElicatePaymentLink({ id: link.id, active: !link.active });
      toast.success(link.active ? "Link disabled" : "Link enabled");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <Card className="border-emerald-500/25">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-emerald-600" />
            Zambia MoMo payment links
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Share a link so others can pay you via MTN, Airtel, or Zamtel. Funds credit your ZMW wallet.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" className="shrink-0" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" />
            New link
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="rounded-xl border p-4 space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as "fixed" | "flexible")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                    <SelectItem value="flexible">Flexible amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {type === "fixed" ? (
                <div className="space-y-2">
                  <Label>Amount (ZMW)</Label>
                  <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Minimum (ZMW)</Label>
                  <Input type="number" min={0} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)} disabled={creating}>Cancel</Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading links…
          </p>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">No MoMo payment links yet.</p>
        ) : (
          <div className="space-y-2">
            {links.map((link) => (
              <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{link.name}</p>
                    <Badge variant={link.active ? "default" : "secondary"}>
                      {link.active ? "Active" : "Off"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {link.type === "fixed"
                      ? `Fixed ZMW ${link.amount ?? "—"}`
                      : `Flexible · min ZMW ${link.min_amount ?? 0}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void copyLink(link.url)}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void toggleActive(link)}>
                    {link.active ? "Disable" : "Enable"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
