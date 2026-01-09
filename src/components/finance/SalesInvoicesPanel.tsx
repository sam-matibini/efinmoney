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
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, FileText, Eye } from "lucide-react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";

interface InvoiceLine {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  amount: number;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-500',
  sent: 'bg-blue-500/10 text-blue-500',
  paid: 'bg-green-500/10 text-green-500',
  partial: 'bg-yellow-500/10 text-yellow-500',
  overdue: 'bg-red-500/10 text-red-500',
  cancelled: 'bg-gray-500/10 text-gray-400',
};

export const SalesInvoicesPanel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<any>(null);
  const [formData, setFormData] = useState({
    customer_id: '',
    issue_date: format(new Date(), 'yyyy-MM-dd'),
    due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    notes: '',
  });
  const [lines, setLines] = useState<InvoiceLine[]>([
    { description: '', quantity: 1, unit_price: 0, tax_rate: 0, amount: 0 },
  ]);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('id, name').eq('is_active', true).order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['sales-invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_invoices')
        .select(`*, customers(name)`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: invoiceItems = [] } = useQuery({
    queryKey: ['invoice-items', viewingInvoice?.id],
    queryFn: async () => {
      if (!viewingInvoice?.id) return [];
      const { data, error } = await supabase
        .from('sales_invoice_items')
        .select('*')
        .eq('invoice_id', viewingInvoice.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!viewingInvoice?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const validLines = lines.filter(l => l.description && l.quantity > 0);
      if (validLines.length === 0) throw new Error('At least one line item required');

      const subtotal = validLines.reduce((sum, l) => sum + l.amount, 0);
      const taxAmount = validLines.reduce((sum, l) => sum + (l.amount * l.tax_rate / 100), 0);
      const totalAmount = subtotal + taxAmount;

      // Generate invoice number
      const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;

      const { data: invoice, error: invoiceError } = await supabase
        .from('sales_invoices')
        .insert({
          invoice_number: invoiceNumber,
          customer_id: formData.customer_id,
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

      if (invoiceError) throw invoiceError;

      const itemsToInsert = validLines.map(line => ({
        invoice_id: invoice.id,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        tax_rate: line.tax_rate,
        amount: line.amount,
      }));

      const { error: itemsError } = await supabase.from('sales_invoice_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      return invoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      toast.success('Invoice created successfully');
      resetForm();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "draft" | "sent" | "paid" | "partial" | "overdue" | "cancelled" }) => {
      const { error } = await supabase.from('sales_invoices').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      toast.success('Invoice status updated');
    },
  });

  const resetForm = () => {
    setFormData({
      customer_id: '',
      issue_date: format(new Date(), 'yyyy-MM-dd'),
      due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      notes: '',
    });
    setLines([{ description: '', quantity: 1, unit_price: 0, tax_rate: 0, amount: 0 }]);
    setIsDialogOpen(false);
  };

  const updateLine = (index: number, field: keyof InvoiceLine, value: string | number) => {
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
        <CardHeader><CardTitle>Sales Invoices</CardTitle></CardHeader>
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
            <FileText className="w-5 h-5" />
            Sales Invoices
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsDialogOpen(open); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" />New Invoice</Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Sales Invoice</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Customer *</Label>
                    <Select value={formData.customer_id} onValueChange={(v) => setFormData({ ...formData, customer_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                      <SelectContent>
                        {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Issue Date</Label>
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
                  <Button onClick={() => createMutation.mutate()} disabled={!formData.customer_id || createMutation.isPending}>
                    Create Invoice
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
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">No invoices found</TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono">{inv.invoice_number}</TableCell>
                      <TableCell>{inv.customers?.name}</TableCell>
                      <TableCell>{format(new Date(inv.issue_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>{format(new Date(inv.due_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-right font-mono">{inv.currency_code} {Number(inv.total_amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <Select value={inv.status} onValueChange={(v: "draft" | "sent" | "paid" | "partial" | "overdue" | "cancelled") => updateStatusMutation.mutate({ id: inv.id, status: v })}>
                          <SelectTrigger className={`w-28 h-8 ${statusColors[inv.status]}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="sent">Sent</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="partial">Partial</SelectItem>
                            <SelectItem value="overdue">Overdue</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => setViewingInvoice(inv)}>
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

      {viewingInvoice && (
        <Dialog open={!!viewingInvoice} onOpenChange={() => setViewingInvoice(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Invoice {viewingInvoice.invoice_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><strong>Customer:</strong> {viewingInvoice.customers?.name}</div>
                <div><strong>Status:</strong> <Badge className={statusColors[viewingInvoice.status]}>{viewingInvoice.status}</Badge></div>
                <div><strong>Issue Date:</strong> {format(new Date(viewingInvoice.issue_date), 'MMM d, yyyy')}</div>
                <div><strong>Due Date:</strong> {format(new Date(viewingInvoice.due_date), 'MMM d, yyyy')}</div>
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
                  {invoiceItems.map((item: any) => (
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
                  <div className="flex justify-between"><span>Subtotal:</span><span className="font-mono">{Number(viewingInvoice.subtotal).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Tax:</span><span className="font-mono">{Number(viewingInvoice.tax_amount).toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold border-t pt-1"><span>Total:</span><span className="font-mono">{Number(viewingInvoice.total_amount).toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
