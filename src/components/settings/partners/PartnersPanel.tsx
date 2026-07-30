import { useState } from "react";
import {
  usePaymentPartners,
  useCreatePartner,
  useUpdatePartner,
  useDeletePartner,
  type PaymentPartner,
} from "@/hooks/usePartnerNetwork";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Network } from "lucide-react";

const csv = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

const statusVariant = (s: string) => (s === "active" ? "default" : s === "pending" ? "secondary" : "outline");

const emptyPartner: Partial<PaymentPartner> = {
  code: "",
  name: "",
  direction: "both",
  status: "active",
  api_status: "pending",
  integration_status: "pending",
  reliability_score: 100,
  compliance_risk: "low",
  priority: 100,
  supported_currencies: [],
  supported_countries: [],
  payment_methods: [],
};

export const PartnersPanel = () => {
  const { data: partners, isLoading } = usePaymentPartners();
  const create = useCreatePartner();
  const update = useUpdatePartner();
  const remove = useDeletePartner();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<PaymentPartner>>(emptyPartner);

  const set = (patch: Partial<PaymentPartner>) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => {
    if (!draft.code || !draft.name) return;
    if (draft.id) {
      const { id, created_at, updated_at, ...patch } = draft as PaymentPartner;
      update.mutate({ id, patch }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(draft, { onSuccess: () => setOpen(false) });
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" /> Payment Partners
          </CardTitle>
          <CardDescription>Pay-in and pay-out providers available to the routing engine</CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setDraft(emptyPartner);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Add partner
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !partners?.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No partners yet. Add your first pay-in or pay-out provider.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Settlement</TableHead>
                  <TableHead className="text-right">Reliability</TableHead>
                  <TableHead className="text-right">Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.code}</div>
                    </TableCell>
                    <TableCell className="capitalize">{p.direction}</TableCell>
                    <TableCell>{p.country || "—"}</TableCell>
                    <TableCell>
                      {p.settlement_currency || "—"}
                      <div className="text-xs text-muted-foreground">{p.settlement_time || ""}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.reliability_score}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.priority}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(p.status)} className="capitalize">
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDraft(p);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove.mutate(p.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit partner" : "Add partner"}</DialogTitle>
            <DialogDescription>
              Routing eligibility, limits and execution routes are all driven by these values.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Code</Label>
              <Input value={draft.code || ""} onChange={(e) => set({ code: e.target.value })} placeholder="flutterwave" />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={draft.name || ""} onChange={(e) => set({ name: e.target.value })} placeholder="Flutterwave" />
            </div>
            <div>
              <Label>Direction</Label>
              <Select value={draft.direction} onValueChange={(v) => set({ direction: v as PaymentPartner["direction"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payin">Pay-in</SelectItem>
                  <SelectItem value="payout">Pay-out</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Operating country</Label>
              <Input value={draft.country || ""} onChange={(e) => set({ country: e.target.value })} placeholder="NG" />
            </div>
            <div>
              <Label>Regulatory status</Label>
              <Input
                value={draft.regulatory_status || ""}
                onChange={(e) => set({ regulatory_status: e.target.value })}
                placeholder="CBN licensed PSP"
              />
            </div>
            <div>
              <Label>Settlement currency</Label>
              <Input
                value={draft.settlement_currency || ""}
                onChange={(e) => set({ settlement_currency: e.target.value.toUpperCase() })}
                placeholder="NGN"
              />
            </div>
            <div>
              <Label>Settlement time</Label>
              <Input
                value={draft.settlement_time || ""}
                onChange={(e) => set({ settlement_time: e.target.value })}
                placeholder="Instant / T+1"
              />
            </div>
            <div>
              <Label>API status</Label>
              <Select value={draft.api_status} onValueChange={(v) => set({ api_status: v as PaymentPartner["api_status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Integration status</Label>
              <Select
                value={draft.integration_status}
                onValueChange={(v) => set({ integration_status: v as PaymentPartner["integration_status"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Connected</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="inactive">Not connected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Compliance risk</Label>
              <Select
                value={draft.compliance_risk}
                onValueChange={(v) => set({ compliance_risk: v as PaymentPartner["compliance_risk"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reliability score (0–100)</Label>
              <Input
                type="number"
                value={draft.reliability_score ?? 100}
                onChange={(e) => set({ reliability_score: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Routing priority</Label>
              <Input type="number" value={draft.priority ?? 100} onChange={(e) => set({ priority: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Min transaction</Label>
              <Input
                type="number"
                value={draft.min_transaction ?? ""}
                onChange={(e) => set({ min_transaction: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Max transaction</Label>
              <Input
                type="number"
                value={draft.max_transaction ?? ""}
                onChange={(e) => set({ max_transaction: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Daily limit</Label>
              <Input
                type="number"
                value={draft.daily_limit ?? ""}
                onChange={(e) => set({ daily_limit: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Monthly limit</Label>
              <Input
                type="number"
                value={draft.monthly_limit ?? ""}
                onChange={(e) => set({ monthly_limit: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Supported currencies (comma separated)</Label>
              <Input
                value={(draft.supported_currencies || []).join(", ")}
                onChange={(e) => set({ supported_currencies: csv(e.target.value.toUpperCase()) })}
                placeholder="CAD, USD, NGN"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Supported countries (comma separated)</Label>
              <Input
                value={(draft.supported_countries || []).join(", ")}
                onChange={(e) => set({ supported_countries: csv(e.target.value.toUpperCase()) })}
                placeholder="CA, NG, ZM"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Payment methods (comma separated)</Label>
              <Input
                value={(draft.payment_methods || []).join(", ")}
                onChange={(e) => set({ payment_methods: csv(e.target.value.toLowerCase()) })}
                placeholder="bank, mobile_money, card, wallet"
              />
            </div>
            <div>
              <Label>Pay-in function</Label>
              <Input
                value={draft.payin_function_slug || ""}
                onChange={(e) => set({ payin_function_slug: e.target.value })}
                placeholder="flw-initialize-payment"
              />
            </div>
            <div>
              <Label>Pay-out function</Label>
              <Input
                value={draft.payout_function_slug || ""}
                onChange={(e) => set({ payout_function_slug: e.target.value })}
                placeholder="flutterwave-payout"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Live quote function (optional)</Label>
              <Input
                value={draft.quote_function_slug || ""}
                onChange={(e) => set({ quote_function_slug: e.target.value })}
                placeholder="nomba-exchange-rate"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={draft.notes || ""} onChange={(e) => set({ notes: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={draft.status} onValueChange={(v) => set({ status: v as PaymentPartner["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={create.isPending || update.isPending}>
              Save partner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default PartnersPanel;
