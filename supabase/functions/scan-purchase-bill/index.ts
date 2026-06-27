// Scan a receipt/invoice (image or PDF) and extract structured purchase bill data
// using Lovable AI Gateway (Gemini multimodal).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface ScanResult {
  vendor_name?: string;
  vendor_reference?: string;
  bill_date?: string;
  due_date?: string;
  currency?: string;
  subtotal?: number;
  tax_total?: number;
  total?: number;
  notes?: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    tax_percent: number;
  }>;
}

const SYSTEM_PROMPT = `You are an expert at extracting structured data from purchase invoices and receipts.
Return a JSON object that strictly matches the provided tool schema.
- Dates must be ISO format YYYY-MM-DD. If due date is missing, omit it.
- Numbers must be plain numbers (no currency symbols, no thousand separators).
- tax_percent is the per-line tax rate as a percent (e.g. 5 for 5%). If unknown, use 0.
- If the receipt has no clear line items, create one summary line with description "Receipt total".
- Use the exact vendor/supplier/merchant name as printed.
- vendor_reference is the invoice/receipt number printed on the document.
- currency is a 3-letter ISO code (USD, CAD, EUR, GBP, NGN, KES, BWP, etc.).
Do not invent data. Leave fields you cannot read out of the JSON entirely (except line_items which must always be an array).`;

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "extract_bill",
    description: "Extract structured purchase bill data from an invoice/receipt.",
    parameters: {
      type: "object",
      properties: {
        vendor_name: { type: "string" },
        vendor_reference: { type: "string" },
        bill_date: { type: "string" },
        due_date: { type: "string" },
        currency: { type: "string" },
        subtotal: { type: "number" },
        tax_total: { type: "number" },
        total: { type: "number" },
        notes: { type: "string" },
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
              tax_percent: { type: "number" },
            },
            required: ["description", "quantity", "unit_price", "tax_percent"],
            additionalProperties: false,
          },
        },
      },
      required: ["line_items"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const fileBase64: string = body?.file_base64 || "";
    const mimeType: string = body?.mime_type || "";
    if (!fileBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: "file_base64 and mime_type are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (fileBase64.length > 14_000_000) {
      return new Response(JSON.stringify({ error: "File too large (max ~10 MB)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dataUrl = `data:${mimeType};base64,${fileBase64}`;
    const isPdf = mimeType === "application/pdf";

    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: "Extract the purchase bill data from this document." },
    ];
    if (isPdf) {
      userContent.push({
        type: "file",
        file: { filename: "invoice.pdf", file_data: dataUrl },
      });
    } else {
      userContent.push({ type: "image_url", image_url: { url: dataUrl } });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "extract_bill" } },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "AI is busy, please try again in a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in workspace billing." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error("AI gateway error", aiRes.status, text);
      return new Response(JSON.stringify({ error: `AI gateway error (${aiRes.status})` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiRes.json();
    const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
    const argStr = toolCall?.function?.arguments;
    if (!argStr) {
      return new Response(JSON.stringify({ error: "Could not read invoice. Please try a clearer photo." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let parsed: ScanResult;
    try {
      parsed = JSON.parse(argStr);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid response from AI" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(parsed.line_items)) parsed.line_items = [];

    return new Response(JSON.stringify({ data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("scan-purchase-bill error", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
