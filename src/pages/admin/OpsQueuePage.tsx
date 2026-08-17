import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { RAIL_OPTIONS } from "@/lib/corridorRails";
import { RefreshCw } from "lucide-react";

const PARTNER_LABELS: Record<string, string> = {
  fincra: "Fincra",
  nomba: "Nomba",
  flovide: "Flovide",
  flutterwave: "Flutterwave",
  flw: "Flutterwave",
  lenhub_flutter: "Lenhub",
  lenhub: "Lenhub",
  paytota: "Paytota",
  swychr: "Swychr",
  ghana_pay: "Ghana Pay",
  elicate: "Elicate",
  interac: "Interac",
};

function partnerName(code: string) {
  return PARTNER_LABELS[code.toLowerCase()] || code;
}

function explainError(raw: string | null | undefined): string {
  const e = (raw || "").toLowerCase();
  if (!e) return "We could not finish paying the recipient automatically.";
  if (e.includes("minimum destination") || e.includes("not be less than") || e.includes("below_payout_minimum") || e.includes("minimum send to")) {
    return "Below provider minimum (NGN needs ≥ ₦100). Use “Boost to min & pay” to top up from company float and send, or refund.";
  }
  if (e.includes("quote http 404") || (e.includes("quote") && e.includes("404"))) {
    return "Fincra could not price this payout route (quote not found). Try Nomba or Flovide, or pay manually then mark completed.";
  }
  if (e.includes("404") || e.includes("not found") || e.includes("corridor")) {
    return "Bank account or payout route not found at the provider. Check bank + account number, then retry or refund.";
  }
  if (e.includes("insufficient") || e.includes("balance") || e.includes("liquidity") || e.includes("float")) {
    return "Provider float/balance was too low. Top up that provider, then retry.";
  }
  if (e.includes("timeout") || e.includes("timed out")) {
    return "Provider timed out. Retry — and check their dashboard in case it actually paid.";
  }
  return raw || "Payout failed.";
}

type OpsTransfer = {
  id: string;
  status: string;
  source_currency: string;
  target_currency: string;
  source_amount: number;
  target_amount: number | null;
  recipient_name: string | null;
  recipient_country: string | null;
  failure_reason: string | null;
  ops_note: string | null;
  rails_attempted: string[] | null;
  created_at: string;
};

async function fetchOpsQueue(): Promise<OpsTransfer[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ops-settle`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session?.access_token || ""}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return (json.transfers || []) as OpsTransfer[];
}

async function opsAction(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ops-settle`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session?.access_token || ""}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json?.success === false && (body.action === "retry" || body.action === "boost_min"))) {
    throw new Error(json?.error || json?.payout?.error || `HTTP ${res.status}`);
  }
  return json;
}

export default function OpsQueuePage() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ops-queue"],
    queryFn: fetchOpsQueue,
    refetchInterval: 30_000,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [rail, setRail] = useState("nomba");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedRow = useMemo(() => rows.find((r) => r.id === selected) || null, [rows, selected]);
  const belowMin =
    !!selectedRow &&
    String(selectedRow.target_currency || "").toUpperCase() === "NGN" &&
    Number(selectedRow.target_amount ?? 0) < 100;

  const run = async (
    action: "retry" | "boost_min" | "complete" | "refund" | "refund_all",
    railOverride?: string,
  ) => {
    if (action !== "refund_all" && !selected) {
      toast.error("Select a transfer first");
      return;
    }
    const useRail = railOverride || rail;
    setBusy(true);
    try {
      const json = await opsAction({
        transfer_id: action === "refund_all" ? undefined : selected,
        action,
        rail: action === "retry" || action === "boost_min" ? useRail : undefined,
        note,
      });
      if (action === "refund_all") {
        toast.success(`Refunded ${json?.count ?? 0} customer wallet(s)`);
      } else if (action === "boost_min") {
        toast.success(
          `Boosted to ${json?.boosted_to ?? 100} NGN and sent via ${partnerName(useRail)} — watch the queue`,
        );
      } else {
        toast.success(
          action === "retry"
            ? "Retry sent — check if status clears from this list"
            : action === "complete"
            ? "Marked as paid"
            : "Refunded to customer wallet",
        );
      }
      setNote("");
      setSelected(null);
      await qc.invalidateQueries({ queryKey: ["ops-queue"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Ops queue</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              These are payouts we could not finish automatically. The customer’s money is still with us
              until you <strong>retry</strong>, <strong>mark paid</strong> (if you paid them yourself),
              or <strong>refund</strong> their wallet.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">How to clear an item</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>1. Click a row to select it.</p>
            <p>2. Pick a payment company and tap <strong>Retry this provider</strong>.</p>
            <p>3. Below NGN min → <strong>Boost to ₦100 &amp; pay</strong> (company covers the shortfall).</p>
            <p>4. If you already sent the money outside the app → <strong>I paid them manually</strong>.</p>
            <p>5. If you cannot pay them → <strong>Refund customer</strong>.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Waiting for you ({rows.length})</CardTitle>
            <CardDescription>Newest holds appear first.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead>When</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Already tried</TableHead>
                    <TableHead>What happened</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow
                      key={t.id}
                      className={selected === t.id ? "bg-muted/50" : "cursor-pointer"}
                      onClick={() => setSelected(t.id)}
                    >
                      <TableCell>
                        <input
                          type="radio"
                          checked={selected === t.id}
                          onChange={() => setSelected(t.id)}
                        />
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(t.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">
                        {Number(t.source_amount).toFixed(2)} {t.source_currency}
                        <span className="text-muted-foreground text-xs"> → {t.target_currency}</span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{t.recipient_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{t.recipient_country}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {(t.rails_attempted || []).length
                          ? (t.rails_attempted || []).map((r) => (
                            <Badge key={r} variant="outline" className="mr-1 mb-1">{partnerName(r)}</Badge>
                          ))
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[280px]" title={t.failure_reason || t.ops_note || ""}>
                        {explainError(t.ops_note || t.failure_reason)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!rows.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground text-sm">
                        Nothing waiting — you’re clear.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedRow
                ? `Selected: ${selectedRow.recipient_name || "transfer"} · ${Number(selectedRow.source_amount).toFixed(2)} ${selectedRow.source_currency}`
                : "Select a transfer above"}
            </CardTitle>
            {selectedRow && (
              <CardDescription>
                {explainError(selectedRow.ops_note || selectedRow.failure_reason)}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Try this payment company</Label>
              <Select value={rail} onValueChange={setRail}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RAIL_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{partnerName(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Note for the team (optional)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Paid via bank transfer, receipt #123"
              />
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button disabled={busy || !selected} onClick={() => run("retry")}>
                Retry this provider
              </Button>
              {belowMin && (
                <Button
                  disabled={busy || !selected}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => {
                    if (
                      confirm(
                        "Boost this payout to ₦100 (company covers the shortfall) and pay via Fincra?",
                      )
                    ) {
                      setRail("fincra");
                      void run("boost_min", "fincra");
                    }
                  }}
                >
                  Boost to ₦100 &amp; pay
                </Button>
              )}
              <Button disabled={busy || !selected} variant="secondary" onClick={() => run("complete")}>
                I paid them manually
              </Button>
              <Button
                disabled={busy || !selected}
                variant="destructive"
                onClick={() => {
                  if (confirm("Refund this amount back to the customer’s wallet?")) run("refund");
                }}
              >
                Refund customer
              </Button>
              <Button
                disabled={busy || rows.length === 0}
                variant="outline"
                className="border-destructive/40 text-destructive"
                onClick={() => {
                  if (
                    confirm(
                      `Refund ALL ${rows.length} held transfer(s) back to customer wallets? Use this when none were paid out (e.g. below NGN 100 min).`,
                    )
                  ) {
                    run("refund_all");
                  }
                }}
              >
                Refund all ({rows.length})
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
