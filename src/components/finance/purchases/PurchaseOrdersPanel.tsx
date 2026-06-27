import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ClipboardList, CheckCircle2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { AttachmentsPanel } from "./AttachmentsPanel";


interface POLine {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  amount: number;
  gl_account_id?: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500",
  pending_approval: "bg-yellow-500/10 text-yellow-500",
  approved: "bg-blue-500/10 text-blue-500",
  sent: "bg-indigo-500/10 text-indigo-500",
  partially_received: "bg-amber-500/10 text-amber-500",
  received: "bg-green-500/10 text-green-500",
  closed: "bg-gray-500/10 text-gray-400",
  cancelled: "bg-red-500/10 text-red-500",
};

export const PurchaseOrdersPanel = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<any>(null);
  const [receiveFor, setReceiveFor] = useState<any>(null);
  const [form, setForm] = useState({
    vendor_id: "",
    currency_code: "CAD",
    expected_date: format(new Date(), "yyyy-MM-dd"),
    notes: "",
  });
  const [lines, setLines] = useState<POLine[]>([
    { description: "", quantity: 1, unit_price: 0, tax_rate: 0, amount: 0 },
  ]);

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-active"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("id, name").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["expense-accounts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ledger_accounts")
        .select("id, code, name")
        .or("code.like.5%,code.like.6%,code.like.1%")
        .order("code");
      return data || [];
    },
  });

  const { data: pos = [], isLoading } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, vendors(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: poItems = [] } = useQuery({
    queryKey: ["po-items", viewing?.id || receiveFor?.id],
    queryFn: async () => {
      const id = viewing?.id || receiveFor?.id;
      if (!id) return [];
      const { data } = await supabase.from("purchase_order_items").select("*").eq("purchase_order_id", id);
      return data || [];
    },
    enabled: !!(viewing?.id || receiveFor?.id),
  });

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const tax = lines.reduce((s, l) => s + (l.amount * l.tax_rate) / 100, 0);
  const total = subtotal + tax;

  const reset = () => {
    setForm({ vendor_id: "", currency_code: "CAD", expected_date: format(new Date(), "yyyy-MM-dd"), notes: "" });
    setLines([{ description: "", quantity: 1, unit_price: 0, tax_rate: 0, amount: 0 }]);
    setOpen(false);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const valid = lines.filter((l) => l.description && l.quantity > 0);
      if (!valid.length) throw new Error("At least one line required");
      const { data: pn } = await supabase.rpc("generate_po_number");
      const { data: po, error } = await supabase
        .from("purchase_orders")
        .insert({
          po_number: pn as unknown as string,
          vendor_id: form.vendor_id,
          currency_code: form.currency_code,
          expected_date: form.expected_date,
          notes: form.notes,
          subtotal,
          tax_amount: tax,
          total_amount: total,
          status: "draft",
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      const { error: iErr } = await supabase.from("purchase_order_items").insert(
        valid.map((l) => ({
          purchase_order_id: po.id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          tax_rate: l.tax_rate,
          amount: l.amount,
          gl_account_id: l.gl_account_id || null,
        })),
      );
      if (iErr) throw iErr;
      return po;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("PO created");
      reset();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const update: any = { status };
      if (status === "approved") {
        update.approved_at = new Date().toISOString();
        update.approver_id = user?.id;
      }
      if (status === "sent") update.sent_at = new Date().toISOString();
      if (status === "closed") update.closed_at = new Date().toISOString();
      const { error } = await supabase.from("purchase_orders").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const receiveMut = useMutation({
    mutationFn: async (receipts: { item_id: string; qty: number }[]) => {
      const po = receiveFor;
      if (!po) throw new Error("No PO");
      const { data: rn } = await supabase.rpc("generate_grn_number");
      const { data: receipt, error: rErr } = await supabase
        .from("purchase_receipts")
        .insert({
          receipt_number: rn as unknown as string,
          purchase_order_id: po.id,
          received_by: user?.id,
        })
        .select()
        .single();
      if (rErr) throw rErr;
      const rows = receipts.filter((r) => r.qty > 0);
      if (rows.length) {
        await supabase.from("purchase_receipt_items").insert(
          rows.map((r) => ({
            receipt_id: receipt.id,
            purchase_order_item_id: r.item_id,
            qty_received: r.qty,
          })),
        );
        // Update qty_received on PO items
        for (const r of rows) {
          const item = poItems.find((i: any) => i.id === r.item_id);
          if (item) {
            await supabase
              .from("purchase_order_items")
              .update({ qty_received: Number(item.qty_received || 0) + r.qty })
              .eq("id", r.item_id);
          }
        }
        // Recompute PO status
        const { data: updated } = await supabase
          .from("purchase_order_items")
          .select("quantity, qty_received")
          .eq("purchase_order_id", po.id);
        const allDone = (updated || []).every((i: any) => Number(i.qty_received) >= Number(i.quantity));
        const some = (updated || []).some((i: any) => Number(i.qty_received) > 0);
        await supabase
          .from("purchase_orders")
          .update({ status: allDone ? "received" : some ? "partially_received" : po.status })
          .eq("id", po.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Goods received");
      setReceiveFor(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateLine = (i: number, key: keyof POLine, value: any) => {
    const next = [...lines];
    (next[i] as any)[key] = value;
    if (key === "quantity" || key === "unit_price") {
      next[i].amount = (next[i].quantity || 0) * (next[i].unit_price || 0);
    }
    setLines(next);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5" /> Purchase Orders
        </CardTitle>
        <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : reset())}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" />New PO</Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Vendor *</Label>
                  <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                    <SelectContent>
                      {vendors.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={form.currency_code} onValueChange={(v) => setForm({ ...form, currency_code: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["CAD","USD","EUR","GBP","NGN","KES","BWP"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Expected Date</Label>
                  <Input type="date" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} />
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[35%]">Description</TableHead>
                      <TableHead>GL Account</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Tax %</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, i) => (
                      <TableRow key={i}>
                        <TableCell><Input value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} /></TableCell>
                        <TableCell>
                          <Select value={line.gl_account_id || ""} onValueChange={(v) => updateLine(i, "gl_account_id", v)}>
                            <SelectTrigger className="w-44"><SelectValue placeholder="Account" /></SelectTrigger>
                            <SelectContent className="max-h-72">
                              {accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input type="number" className="text-right w-20" value={line.quantity} onChange={(e) => updateLine(i, "quantity", parseFloat(e.target.value) || 0)} /></TableCell>
                        <TableCell><Input type="number" step="0.01" className="text-right w-24" value={line.unit_price} onChange={(e) => updateLine(i, "unit_price", parseFloat(e.target.value) || 0)} /></TableCell>
                        <TableCell><Input type="number" step="0.01" className="text-right w-20" value={line.tax_rate} onChange={(e) => updateLine(i, "tax_rate", parseFloat(e.target.value) || 0)} /></TableCell>
                        <TableCell className="text-right font-mono">{line.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, x) => x !== i))} disabled={lines.length <= 1}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button variant="outline" onClick={() => setLines([...lines, { description: "", quantity: 1, unit_price: 0, tax_rate: 0, amount: 0 }])} className="w-full">
                <Plus className="w-4 h-4 mr-2" /> Add Line
              </Button>
              <div className="flex justify-end">
                <div className="w-64 space-y-1 text-sm">
                  <div className="flex justify-between"><span>Subtotal:</span><span className="font-mono">{subtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Tax:</span><span className="font-mono">{tax.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold border-t pt-1"><span>Total:</span><span className="font-mono">{total.toFixed(2)}</span></div>
                </div>
              </div>
              <Textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={reset}>Cancel</Button>
                <Button onClick={() => createMut.mutate()} disabled={!form.vendor_id || createMut.isPending}>Create PO</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO #</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? null : pos.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No purchase orders</TableCell></TableRow>
            ) : pos.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono">{p.po_number}</TableCell>
                <TableCell>{p.vendors?.name}</TableCell>
                <TableCell>{p.expected_date ? format(new Date(p.expected_date), "MMM d") : "-"}</TableCell>
                <TableCell className="text-right font-mono">{p.currency_code} {Number(p.total_amount).toFixed(2)}</TableCell>
                <TableCell><Badge className={statusColors[p.status]}>{p.status.replace("_", " ")}</Badge></TableCell>
                <TableCell className="text-right space-x-1">
                  {p.status === "draft" && <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: p.id, status: "approved" })}><CheckCircle2 className="w-3 h-3 mr-1" />Approve</Button>}
                  {(p.status === "approved" || p.status === "sent" || p.status === "partially_received") &&
                    <Button size="sm" variant="outline" onClick={() => setReceiveFor(p)}><PackageCheck className="w-3 h-3 mr-1" />Receive</Button>}
                  <Button size="sm" variant="ghost" onClick={() => setViewing(p)}>View</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {receiveFor && (
          <Dialog open={!!receiveFor} onOpenChange={() => setReceiveFor(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Receive Goods — {receiveFor.po_number}</DialogTitle></DialogHeader>
              <ReceiveForm items={poItems} onSubmit={(r) => receiveMut.mutate(r)} pending={receiveMut.isPending} />
            </DialogContent>
          </Dialog>
        )}

        {viewing && (
          <Dialog open={!!viewing} onOpenChange={() => setViewing(null)}>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle>PO {viewing.po_number}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Table>
                  <TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Unit</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {poItems.map((i: any) => (
                      <TableRow key={i.id}>
                        <TableCell>{i.description}</TableCell>
                        <TableCell className="text-right">{i.quantity}</TableCell>
                        <TableCell className="text-right">{Number(i.qty_received).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">{Number(i.unit_price).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">{Number(i.amount).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="border-t pt-3">
                  <AttachmentsPanel parentType="po" parentId={viewing.id} />
                </div>
              </div>
            </DialogContent>
          </Dialog>

        )}
      </CardContent>
    </Card>
  );
};

const ReceiveForm = ({ items, onSubmit, pending }: { items: any[]; onSubmit: (r: { item_id: string; qty: number }[]) => void; pending: boolean }) => {
  const [vals, setVals] = useState<Record<string, number>>({});
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Ordered</TableHead><TableHead className="text-right">Already Recv</TableHead><TableHead className="text-right">Receive Now</TableHead></TableRow></TableHeader>
        <TableBody>
          {items.map((i: any) => {
            const remaining = Number(i.quantity) - Number(i.qty_received || 0);
            return (
              <TableRow key={i.id}>
                <TableCell>{i.description}</TableCell>
                <TableCell className="text-right">{i.quantity}</TableCell>
                <TableCell className="text-right">{Number(i.qty_received).toFixed(2)}</TableCell>
                <TableCell>
                  <Input type="number" min="0" max={remaining} className="text-right w-24 ml-auto"
                    value={vals[i.id] ?? ""} onChange={(e) => setVals({ ...vals, [i.id]: parseFloat(e.target.value) || 0 })} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="flex justify-end">
        <Button disabled={pending} onClick={() => onSubmit(Object.entries(vals).map(([item_id, qty]) => ({ item_id, qty })))}>Confirm Receipt</Button>
      </div>
    </div>
  );
};
