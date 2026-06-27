import { useState, useRef } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Receipt, Eye, ScanLine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, addDays, isValid, parseISO } from "date-fns";


interface BillLine {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  amount: number;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-500',
  sent: 'bg-blue-500/10 text-blue-500',
  paid: 'bg-indigo-500/10 text-indigo-500',
  partial: 'bg-yellow-500/10 text-yellow-500',
  overdue: 'bg-red-500/10 text-red-500',
  cancelled: 'bg-gray-500/10 text-gray-400',
};

export const PurchaseBillsPanel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewingBill, setViewingBill] = useState<any>(null);
  const [formData, setFormData] = useState({
    vendor_id: '',
    vendor_reference: '',
    issue_date: format(new Date(), 'yyyy-MM-dd'),
    due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    notes: '',
  });
  const [lines, setLines] = useState<BillLine[]>([
    { description: '', quantity: 1, unit_price: 0, tax_rate: 0, amount: 0 },
  ]);
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileToBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] || "");
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

  // Downscale large images to keep the JSON payload well under the edge gateway limit.
  const compressImage = (file: File, maxDim = 1600, quality = 0.8) =>
    new Promise<Blob>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          return resolve(file);
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            resolve(blob && blob.size < file.size ? blob : file);
          },
          "image/jpeg",
          quality,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read image"));
      };
      img.src = url;
    });

  const normalizeDate = (val?: string) => {
    if (!val) return undefined;
    const d = parseISO(val);
    return isValid(d) ? format(d, "yyyy-MM-dd") : undefined;
  };

  const handleScanFile = async (file: File) => {
    const isPdf = file.type === "application/pdf";
    if (isPdf && file.size > 4 * 1024 * 1024) {
      toast.error("PDF too large — max 4 MB");
      return;
    }
    if (!isPdf && file.size > 8 * 1024 * 1024) {
      toast.error("File too large — max 8 MB");
      return;
    }
    setScanning(true);
    const tId = toast.loading("Reading invoice…");
    try {
      let blob: Blob = file;
      let mime = file.type || "application/octet-stream";
      if (file.type.startsWith("image/")) {
        blob = await compressImage(file);
        mime = "image/jpeg";
      }
      const base64 = await fileToBase64(blob);
      const { data, error } = await supabase.functions.invoke("scan-purchase-bill", {
        body: { file_base64: base64, mime_type: mime },
      });
      if (error) {
        let serverMsg = "";
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const j = await ctx.json();
            serverMsg = j?.error || JSON.stringify(j);
          } else if (ctx && typeof ctx.text === "function") {
            serverMsg = await ctx.text();
          }
        } catch { /* ignore */ }
        console.error("scan-purchase-bill error", error, serverMsg);
        throw new Error(serverMsg || error.message || "Scan failed");
      }

      const result = data?.data;
      if (!result) throw new Error("No data returned");

      // Vendor match
      let vendorId = formData.vendor_id;
      let vendorNotFound = false;
      if (result.vendor_name) {
        const match = vendors.find(
          (v: any) => v.name?.toLowerCase().trim() === result.vendor_name.toLowerCase().trim(),
        );
        if (match) vendorId = match.id;
        else vendorNotFound = true;
      }

      const issueDate = normalizeDate(result.bill_date) || formData.issue_date;
      const dueDate =
        normalizeDate(result.due_date) ||
        format(addDays(parseISO(issueDate), 30), "yyyy-MM-dd");

      setFormData({
        vendor_id: vendorId,
        vendor_reference: result.vendor_reference || formData.vendor_reference,
        issue_date: issueDate,
        due_date: dueDate,
        notes: result.notes || formData.notes,
      });

      const newLines: BillLine[] = (result.line_items || []).map((li: any) => {
        const qty = Number(li.quantity) || 1;
        const price = Number(li.unit_price) || 0;
        return {
          description: String(li.description || ""),
          quantity: qty,
          unit_price: price,
          tax_rate: Number(li.tax_percent) || 0,
          amount: qty * price,
        };
      });
      if (newLines.length === 0 && result.total) {
        newLines.push({
          description: "Receipt total",
          quantity: 1,
          unit_price: Number(result.total) || 0,
          tax_rate: 0,
          amount: Number(result.total) || 0,
        });
      }
      if (newLines.length > 0) setLines(newLines);

      toast.success(
        vendorNotFound
          ? `Scanned — vendor "${result.vendor_name}" not found, please select`
          : "Invoice scanned — review before saving",
        { id: tId },
      );
    } catch (e: any) {
      toast.error(e?.message || "Could not scan invoice", { id: tId });
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendors').select('id, name').eq('is_active', true).order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['purchase-bills'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_bills')
        .select(`*, vendors(name)`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: billItems = [] } = useQuery({
    queryKey: ['bill-items', viewingBill?.id],
    queryFn: async () => {
      if (!viewingBill?.id) return [];
      const { data, error } = await supabase
        .from('purchase_bill_items')
        .select('*')
        .eq('bill_id', viewingBill.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!viewingBill?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const validLines = lines.filter(l => l.description && l.quantity > 0);
      if (validLines.length === 0) throw new Error('At least one line item required');

      const subtotal = validLines.reduce((sum, l) => sum + l.amount, 0);
      const taxAmount = validLines.reduce((sum, l) => sum + (l.amount * l.tax_rate / 100), 0);
      const totalAmount = subtotal + taxAmount;

      const billNumber = `BILL-${Date.now().toString().slice(-8)}`;

      const { data: bill, error: billError } = await supabase
        .from('purchase_bills')
        .insert({
          bill_number: billNumber,
          vendor_id: formData.vendor_id,
          vendor_reference: formData.vendor_reference || null,
          issue_date: formData.issue_date,
          due_date: formData.due_date,
          subtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          notes: formData.notes,
          created_by: user?.id,
        })
        .select()
        .single();

      if (billError) throw billError;

      const itemsToInsert = validLines.map(line => ({
        bill_id: bill.id,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        tax_rate: line.tax_rate,
        amount: line.amount,
      }));

      const { error: itemsError } = await supabase.from('purchase_bill_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      return bill;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-bills'] });
      toast.success('Bill created successfully');
      resetForm();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "draft" | "sent" | "paid" | "partial" | "overdue" | "cancelled" }) => {
      const { error } = await supabase.from('purchase_bills').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-bills'] });
      toast.success('Bill status updated');
    },
  });

  const resetForm = () => {
    setFormData({
      vendor_id: '',
      vendor_reference: '',
      issue_date: format(new Date(), 'yyyy-MM-dd'),
      due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      notes: '',
    });
    setLines([{ description: '', quantity: 1, unit_price: 0, tax_rate: 0, amount: 0 }]);
    setIsDialogOpen(false);
  };

  const updateLine = (index: number, field: keyof BillLine, value: string | number) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'quantity' || field === 'unit_price') {
      updated[index].amount = updated[index].quantity * updated[index].unit_price;
    }
    setLines(updated);
  };

  const addLine = () => setLines([...lines, { description: '', quantity: 1, unit_price: 0, tax_rate: 0, amount: 0 }]);
  const removeLine = (index: number) => lines.length > 1 && setLines(lines.filter((_, i) => i !== index));

  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const taxAmount = lines.reduce((sum, l) => sum + (l.amount * l.tax_rate / 100), 0);
  const total = subtotal + taxAmount;

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Purchase Bills</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Purchase Bills
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsDialogOpen(open); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" />New Bill</Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Purchase Bill</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed border-primary/40 rounded-lg p-4 bg-primary/5 flex items-center justify-between gap-4 cursor-pointer hover:bg-primary/10 transition"
                  onClick={() => !scanning && fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f && !scanning) handleScanFile(f);
                  }}
                >
                  <div className="flex items-center gap-3">
                    {scanning ? (
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    ) : (
                      <ScanLine className="w-5 h-5 text-primary" />
                    )}
                    <div className="text-sm">
                      <div className="font-medium">
                        {scanning ? "Reading invoice…" : "Scan a receipt or invoice to autofill"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Upload an image or PDF, or drag & drop here
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={scanning}
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  >
                    Upload file
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleScanFile(f);
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Vendor *</Label>
                    <Select value={formData.vendor_id} onValueChange={(v) => setFormData({ ...formData, vendor_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                      <SelectContent>
                        {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Vendor Reference</Label>
                    <Input value={formData.vendor_reference} onChange={(e) => setFormData({ ...formData, vendor_reference: e.target.value })} placeholder="Vendor invoice #" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Bill Date</Label>
                    <Input type="date" value={formData.issue_date} onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Due Date</Label>
                    <Input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} />
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40%]">Description</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Tax %</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Input value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} placeholder="Item description" />
                          </TableCell>
                          <TableCell>
                            <Input type="number" min="1" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', parseFloat(e.target.value) || 0)} className="text-right w-20" />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="0.01" value={line.unit_price} onChange={(e) => updateLine(i, 'unit_price', parseFloat(e.target.value) || 0)} className="text-right w-24" />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="0.01" value={line.tax_rate} onChange={(e) => updateLine(i, 'tax_rate', parseFloat(e.target.value) || 0)} className="text-right w-20" />
                          </TableCell>
                          <TableCell className="text-right font-mono">{line.amount.toFixed(2)}</TableCell>
                          <TableCell>
                            <Button size="icon" variant="ghost" onClick={() => removeLine(i)} disabled={lines.length <= 1}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Button type="button" variant="outline" onClick={addLine} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />Add Line
                </Button>

                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between"><span>Subtotal:</span><span className="font-mono">{subtotal.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>Tax:</span><span className="font-mono">{taxAmount.toFixed(2)}</span></div>
                    <div className="flex justify-between font-bold border-t pt-2"><span>Total:</span><span className="font-mono">{total.toFixed(2)}</span></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                  <Button onClick={() => createMutation.mutate()} disabled={!formData.vendor_id || createMutation.isPending}>
                    Create Bill
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Vendor Ref</TableHead>
                  <TableHead>Bill Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">No bills found</TableCell>
                  </TableRow>
                ) : (
                  bills.map((bill: any) => (
                    <TableRow key={bill.id}>
                      <TableCell className="font-mono">{bill.bill_number}</TableCell>
                      <TableCell>{bill.vendors?.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{bill.vendor_reference || '-'}</TableCell>
                      <TableCell>{format(new Date(bill.issue_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>{format(new Date(bill.due_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-right font-mono">{bill.currency_code} {Number(bill.total_amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <Select value={bill.status} onValueChange={(v: "draft" | "sent" | "paid" | "partial" | "overdue" | "cancelled") => updateStatusMutation.mutate({ id: bill.id, status: v })}>
                          <SelectTrigger className={`w-28 h-8 ${statusColors[bill.status]}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="sent">Received</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="partial">Partial</SelectItem>
                            <SelectItem value="overdue">Overdue</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => setViewingBill(bill)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {viewingBill && (
        <Dialog open={!!viewingBill} onOpenChange={() => setViewingBill(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Bill {viewingBill.bill_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><strong>Vendor:</strong> {viewingBill.vendors?.name}</div>
                <div><strong>Status:</strong> <Badge className={statusColors[viewingBill.status]}>{viewingBill.status}</Badge></div>
                <div><strong>Bill Date:</strong> {format(new Date(viewingBill.issue_date), 'MMM d, yyyy')}</div>
                <div><strong>Due Date:</strong> {format(new Date(viewingBill.due_date), 'MMM d, yyyy')}</div>
                {viewingBill.vendor_reference && <div><strong>Vendor Ref:</strong> {viewingBill.vendor_reference}</div>}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billItems.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right font-mono">{Number(item.unit_price).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{Number(item.amount).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end">
                <div className="w-48 space-y-1 text-sm">
                  <div className="flex justify-between"><span>Subtotal:</span><span className="font-mono">{Number(viewingBill.subtotal).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Tax:</span><span className="font-mono">{Number(viewingBill.tax_amount).toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold border-t pt-1"><span>Total:</span><span className="font-mono">{Number(viewingBill.total_amount).toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
