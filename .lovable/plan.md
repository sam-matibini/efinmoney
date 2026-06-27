## Goal
Add a "Scan receipt / invoice" feature to the Create Purchase Bill modal in `src/components/finance/PurchaseBillsPanel.tsx`. The user uploads a photo or PDF of a receipt/invoice, and AI extracts the data and autofills the form (vendor reference, dates, line items, tax, totals, notes).

## UX
At the top of the modal, above the Vendor field, add a dashed upload zone:

```
┌─────────────────────────────────────────────────┐
│  📄  Scan a receipt or invoice to autofill      │
│      [Upload image / PDF]    or drag & drop     │
└─────────────────────────────────────────────────┘
```

Flow:
1. User selects an image (jpg/png/webp) or PDF (≤10 MB).
2. Inline spinner: "Reading invoice…"
3. On success: form fields populate; toast "Invoice scanned — review and edit before saving".
4. If a vendor name is extracted and matches an existing vendor (case-insensitive), auto-select it; otherwise show it in the Vendor Reference field and toast "Vendor not found — please select or add".
5. On failure: toast with the error; form left untouched.

The user can still edit every field. Existing manual flow is unchanged.

## Backend
New edge function `supabase/functions/scan-purchase-bill/index.ts`:
- Auth-required (verify JWT).
- Accepts `{ file_base64, mime_type }`.
- Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with a multimodal message: text prompt + `image_url` (data URL) for images, or `file` block for PDFs.
- Uses structured output (`Output.object` + Zod) returning:
  ```ts
  {
    vendor_name?: string,
    vendor_reference?: string,
    bill_date?: string,        // YYYY-MM-DD
    due_date?: string,         // YYYY-MM-DD
    currency?: string,
    subtotal?: number,
    tax_total?: number,
    total?: number,
    notes?: string,
    line_items: Array<{
      description: string,
      quantity: number,
      unit_price: number,
      tax_percent: number,
    }>
  }
  ```
- Returns parsed object; handles `429` / `402` from gateway with friendly messages.
- Registered in `supabase/config.toml` with `verify_jwt = true`.

## Frontend changes (`PurchaseBillsPanel.tsx` only)
- Add `scanning` state + hidden `<input type="file" accept="image/*,application/pdf">`.
- Add `handleScan(file)`:
  - Reads file as base64, invokes `scan-purchase-bill`.
  - Maps result into existing form state (vendor lookup by name, lines mapped to current line shape, dates normalized, falls back gracefully when fields are missing).
- Add the upload zone JSX at the top of the dialog content.
- Reuse existing vendor list already loaded in the component to match `vendor_name`.

## Out of scope
- No new DB tables, no storing the uploaded file.
- No changes to sales invoices or other modals (can be replicated later if desired).
- No OCR fallback — Gemini multimodal handles both images and PDFs natively.

## Files touched
- `src/components/finance/PurchaseBillsPanel.tsx` (edit)
- `supabase/functions/scan-purchase-bill/index.ts` (new)
- `supabase/config.toml` (register function)
