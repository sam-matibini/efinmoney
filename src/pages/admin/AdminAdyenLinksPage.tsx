import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Link as LinkIcon, ArrowLeft } from "lucide-react";
import { createAdyenPayLink } from "@/lib/adyen";

interface PayLink {
  id: string;
  reference: string;
  amount_minor: number;
  currency: string;
  status: string;
  description: string | null;
  url: string | null;
  short_code: string | null;
  customer_email: string | null;
  expires_at: string | null;
  created_at: string;
}

export default function AdminAdyenLinksPage() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("CAD");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<PayLink[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("adyen_pay_by_link")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setLinks((data as any) || []);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setLoading(true);
    try {
      const link = await createAdyenPayLink({
        amount: amt,
        currency,
        purpose: "admin_link",
        description: description || `Payment request — ${amt} ${currency}`,
        customer_email: email || null,
        expires_in_hours: 72,
      });
      toast.success("Pay link created");
      await navigator.clipboard.writeText(link.short_url).catch(() => {});
      setAmount("");
      setDescription("");
      setEmail("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Admin
        </Button>
        <div>
          <h1 className="text-2xl font-display font-bold">Adyen Pay by Link</h1>
          <p className="text-muted-foreground">Generate hosted payment links for any customer.</p>
        </div>

        <Card>
          <CardHeader><CardTitle>Create new link</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Amount</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100.00" />
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["CAD","USD","EUR","GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Customer email (optional)</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
            </div>
            <div className="md:col-span-2">
              <Label>Description</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Invoice #1234 — services rendered" />
            </div>
            <div className="md:col-span-2">
              <Button onClick={create} disabled={loading} className="w-full">
                <LinkIcon className="w-4 h-4 mr-2" />
                {loading ? "Creating…" : "Create Pay Link"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent links</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No links yet</TableCell></TableRow>
                ) : links.map(l => {
                  const shortUrl = l.short_code ? `${window.location.origin}/s/${l.short_code}` : l.url;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{l.reference.slice(-20)}</TableCell>
                      <TableCell>{(l.amount_minor / 100).toFixed(2)} {l.currency}</TableCell>
                      <TableCell><Badge variant={l.status === "paid" ? "default" : "outline"}>{l.status}</Badge></TableCell>
                      <TableCell>
                        {shortUrl && (
                          <Button variant="ghost" size="sm" onClick={() => {
                            navigator.clipboard.writeText(shortUrl);
                            toast.success("Copied");
                          }}>
                            <Copy className="w-3 h-3 mr-1" /> Copy
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{l.expires_at ? new Date(l.expires_at).toLocaleString() : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
