## Current state (verified)

- `CommunicationsPanel.tsx` ("Communication Hub") only inserts a row into `customer_communications` and marks it `sent` — nothing is actually delivered. The channel picker offers email/SMS/WhatsApp/etc. regardless.
- The recipient dropdown reads only the `customers` table, which currently holds 1 row — app users in `profiles` cannot be messaged.
- `send-email` (Resend) works and already writes outbound emails to `customer_communications`, so the CRM timeline picks them up.
- `customer_communications` has no attachment support; storage has no bucket for message files.
- Only `RESEND_API_KEY` is configured — no SMS/WhatsApp provider.

## Plan

### 1. Database + storage
- New table `communication_attachments`: `communication_id`, `file_name`, `file_path`, `mime_type`, `size_bytes`, `uploaded_by`. Staff read/write policies matching the existing `customer_communications` policies, plus service_role grants.
- New private storage bucket `communication-attachments` with staff-only read/write policies on `storage.objects`.
- Add `recipient_email`, `recipient_name`, and `error_message` columns to `customer_communications` so a message can target an app user or a plain address and record failures.

### 2. Real sending — `send-communication` edge function
- Verifies the caller is staff, validates channel/recipient/content.
- **Email**: renders the staff message into the eFinMoney-branded HTML shell and sends via Resend. Attachments are not embedded — each file gets a signed download link (7-day expiry) rendered as a "Documents" block in the email, per your choice.
- **In-app**: writes a `notifications` row for the target user.
- **Phone call / meeting / note**: recorded as a logged interaction (no delivery attempt) — this is how staff capture calls.
- **SMS / WhatsApp**: kept in the UI but clearly marked "logged only — no provider connected", saved with status `logged` instead of a fake `sent`. When you're ready to add Twilio, only this branch changes.
- Every path writes one `customer_communications` row with real status (`sent` / `failed` / `logged`) and the provider message id or error in `metadata`.

### 3. Communication Hub UI
- Recipient picker becomes a searchable combobox over **app users (profiles) + CRM customers**, showing name, email and which source they came from; free-text email still allowed.
- Channel select shows availability badges (Email = live, SMS/WhatsApp = logged only).
- Attachment area: multi-file upload with progress, size/type validation, list with remove; files upload to the bucket before send and are linked to the created message.
- Table rows gain an attachment (paperclip) indicator and a detail drawer showing full content, delivery status, error text, and downloadable attachments via signed URLs.
- Failures surface the real provider error instead of a generic toast.

### 4. Attachments across the CRM
- Extend `CustomerCommunicationsPanel.tsx` and `UserActivityTimeline.tsx` so any message shown there lists its attachments with secure download links.
- The "Log interaction" dialog in the timeline gains the same upload control, so staff can attach a scanned letter or signed form to a logged call.

### 5. Verification
- Send a live email from the hub with an attachment to a test address and confirm the Resend response, the `customer_communications` row, the attachment row, and a working signed link.
- Confirm the message appears in the user's CRM timeline with the attachment.

## Technical notes

- Files are stored privately; nothing is served publicly. Links in emails are Supabase signed URLs with a 7-day expiry, regenerated on demand inside the app.
- No fake "sent" statuses: unsupported channels are stored as `logged` so reporting stays honest.
- SMS/WhatsApp go live later by adding provider credentials and one branch in `send-communication` — no UI or schema rework needed.
