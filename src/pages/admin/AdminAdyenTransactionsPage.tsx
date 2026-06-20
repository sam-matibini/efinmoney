import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { modifyAdyenPayment } from "@/lib/adyen";

interface PaymentSession {
  id: string;
  reference: string;
  psp_reference: string | null;
  amount_minor: number;
  currency: string;
  status: string;
  payment_method: string | null;
  created_at: string;
}

const STATUS_VARIANT: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  settled: "default",
  authorised: "secondary",
  refunded: "outline",
  cancelled: "outline",
  refused: "destructive",
  error: "destructive",
  pending: "outline",
};

export default function AdminAdyenTransactionsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<PaymentSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("adyen_payment_sessions")
      .select("id,reference,psp_reference,amount_minor,currency,status,payment_method,created_at")
      .not("psp_reference", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);
    setSessions((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const act = async (session: PaymentSession, action: "capture" | "cancel" | "refund") => {
    setActingOn(session.id);
    try {
      const result = await modifyAdyenPayment({ session_id: session.id, action });
      toast.success(
        `${action[0].toUpperCase()}${action.slice(1)} request accepted (${result.adyen.status}). ` +
        `Final status arrives via webhook in a few seconds.`,
      );
      // The capture/cancel/refund is async on Adyen's side — the row's status only
      // flips once the webhook lands. Poll a few times so the table self-updates.
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        await load();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setActingOn(null);
    }
  };

  const prettyMethod = (m: string | null) => {
    if (!m || m === "[object Object]") return "card";
    return m;
  };

  // Immediate-settlement methods (Alipay etc.) can't be captured/cancelled/refunded.
  const NON_MODIFIABLE = ["alipay", "wechatpay", "paypal", "ideal", "sofort", "giropay", "blik", "mbway", "trustly"];
  const isModifiable = (m: string | null) => {
    if (!m) return true;
    const lower = m.toLowerCase();
    return !NON_MODIFIABLE.some((x) => lower.includes(x));
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Admin
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold">Adyen Transactions</h1>
            <p className="text-muted-foreground">
              Capture, cancel, or refund authorised test payments — useful to complete Adyen's test-integration checklist.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm space-y-1">
          <p className="font-medium">Order matters (Adyen rules):</p>
          <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
            <li><strong>Cancel</strong> only works on an <em>authorised</em> payment that has <em>not</em> been captured.</li>
            <li><strong>Capture</strong> an authorised payment to settle it. After that, Cancel is no longer possible.</li>
            <li><strong>Refund</strong> only works <em>after</em> a payment is captured (settled).</li>
          </ul>
          <li><strong>Use a card</strong> (test card <code>4111 1111 1111 1111</code>). Alipay and other instant wallets settle immediately and can't be captured, cancelled, or refunded.</li>
          <p className="text-muted-foreground">To test all four, use separate <em>card</em> payments: cancel one authorised payment, and capture + refund a different one.</p>
        </div>

        <Card>
          <CardHeader><CardTitle>Recent authorised payments</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No authorised payments yet — complete a test top-up first.</TableCell></TableRow>
                ) : sessions.map((s) => {
                  const acting = actingOn === s.id;
                  const modifiable = isModifiable(s.payment_method);
                  const canCapture = modifiable && s.status === "authorised";
                  const canCancel = modifiable && s.status === "authorised";
                  const canRefund = modifiable && s.status === "settled";
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.reference.slice(-24)}</TableCell>
                      <TableCell>{(s.amount_minor / 100).toFixed(2)} {s.currency}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[s.status] || "outline"}>{s.status}</Badge></TableCell>
                      <TableCell className="text-xs">{prettyMethod(s.payment_method)}</TableCell>
                      <TableCell className="text-xs">{new Date(s.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-right space-x-2">
                        {!modifiable ? (
                          <span className="text-xs text-muted-foreground">
                            {prettyMethod(s.payment_method)} settles instantly — no capture/cancel/refund
                          </span>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" disabled={!canCapture || acting} onClick={() => act(s, "capture")}>
                              Capture
                            </Button>
                            <Button size="sm" variant="outline" disabled={!canCancel || acting} onClick={() => act(s, "cancel")}>
                              Cancel
                            </Button>
                            <Button size="sm" variant="outline" disabled={!canRefund || acting} onClick={() => act(s, "refund")}>
                              Refund
                            </Button>
                          </>
                        )}
                      </TableCell>
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
