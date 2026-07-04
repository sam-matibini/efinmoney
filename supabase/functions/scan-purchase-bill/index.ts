// Scan a receipt/invoice (image or PDF) and extract structured purchase bill data
// using the Anthropic API (Claude — multimodal vision + PDF support).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5"; // multimodal — reads images and PDFs

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

// Anthropic tool schema — Claude is forced to call this to return structured data.
const EXTRACT_TOOL = {
  name: "extract_bill",
  description: "Extract structured purchase bill data from an invoice/receipt.",
  input_schema: {
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
        },
      },
    },
    required: ["line_items"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const fileBase64: string = body?.file_base64 || "";
    const mimeType: string = body?.mime_type || "";
    if (!fileBase64 || !mimeType) return jsonResponse({ error: "file_base64 and mime_type are required" }, 400);
    if (fileBase64.length > 11_000_000) return jsonResponse({ error: "File too large (max ~8 MB)" }, 400);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return jsonResponse({ error: "Scanning is not configured yet (missing ANTHROPIC_API_KEY)." }, 500);

    const isPdf = mimeType === "application/pdf";
    const fileBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
      : { type: "image", source: { type: "base64", media_type: mimeType, data: fileBase64 } };

    const aiRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "tool", name: "extract_bill" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the purchase bill data from this document." },
              fileBlock,
            ],
          },
        ],
      }),
    });

    if (aiRes.status === 429) return jsonResponse({ error: "AI is busy, please try again in a moment." }, 429);
    if (!aiRes.ok) {
      const errBody = await aiRes.json().catch(() => ({}));
      const detail = errBody?.error?.message || `HTTP ${aiRes.status}`;
      console.error("anthropic error", aiRes.status, detail);
      return jsonResponse({ error: `AI error: ${detail}` }, 502);
    }

    const json = await aiRes.json();
    // deno-lint-ignore no-explicit-any
    const toolUse = (json?.content || []).find((b: any) => b?.type === "tool_use" && b?.name === "extract_bill");
    if (!toolUse?.input) return jsonResponse({ error: "Could not read invoice. Please try a clearer photo." }, 422);

    const parsed = toolUse.input as ScanResult;
    if (!Array.isArray(parsed.line_items)) parsed.line_items = [];

    return jsonResponse({ data: parsed });
  } catch (err) {
    console.error("scan-purchase-bill error", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
