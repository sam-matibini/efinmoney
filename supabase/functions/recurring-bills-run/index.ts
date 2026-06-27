// Cron-invoked: generates draft bills from active recurring templates whose next_run_at <= now.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: due } = await admin
    .from("recurring_bill_templates")
    .select("*")
    .eq("is_active", true)
    .lte("next_run_at", new Date().toISOString());

  const created: string[] = [];
  for (const t of due || []) {
    if (t.end_date && new Date(t.end_date) < new Date()) {
      await admin.from("recurring_bill_templates").update({ is_active: false }).eq("id", t.id);
      continue;
    }
    const subtotal = Number(t.amount);
    const tax = subtotal * (Number(t.tax_rate || 0) / 100);
    const total = subtotal + tax;
    const billNumber = `BILL-${Date.now().toString().slice(-8)}`;
    const issue = new Date();
    const due_date = new Date(issue.getTime() + 30 * 86400000);

    const { data: bill, error } = await admin.from("purchase_bills").insert({
      bill_number: billNumber,
      vendor_id: t.vendor_id,
      vendor_reference: t.name,
      issue_date: issue.toISOString().slice(0, 10),
      due_date: due_date.toISOString().slice(0, 10),
      subtotal, tax_amount: tax, total_amount: total,
      currency_code: t.currency_code,
      notes: t.description,
      status: "draft",
      payment_status: "unpaid",
      recurring_template_id: t.id,
    }).select().single();

    if (!error && bill) {
      await admin.from("purchase_bill_items").insert({
        bill_id: bill.id, description: t.description || t.name,
        quantity: 1, unit_price: subtotal, tax_rate: Number(t.tax_rate || 0), amount: subtotal,
        account_id: t.gl_account_id,
      });
      created.push(bill.id);

      // advance next_run_at
      const next = new Date(t.next_run_at);
      const step: Record<string, number> = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365 };
      next.setDate(next.getDate() + (step[t.frequency] || 30));
      await admin.from("recurring_bill_templates").update({
        last_generated_at: new Date().toISOString(),
        next_run_at: next.toISOString(),
      }).eq("id", t.id);
    }
  }

  return new Response(JSON.stringify({ created_count: created.length, bill_ids: created }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
