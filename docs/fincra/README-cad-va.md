# Fincra CAD collection account (corporate) — request payload

Endpoint: `POST https://api.fincra.com/profile/virtual-accounts/requests`
Headers: `api-key: <FINCRA_SECRET_KEY>`, optional `x-business-id: <FINCRA_BUSINESS_ID>`
Docs: https://docs.fincra.com/docs/cad-collections-interac-e-transfer

Payload file: `docs/fincra/fincra-cad-va-request.corporate.json`
This is the **corporate / business** shape. The individual-KYC shape
(`KYCInformation` + `meansOfId` + `utilityBill`) used by
`scripts/submit-fincra-cad-va.mjs` is unchanged and lives separately.

## Placeholders to fill

Every value that starts with `FILL_ME` must be replaced before sending. Nothing
in the file is guessed.

| Block | Fields |
| --- | --- |
| Request | `merchantReference` (or delete it — the submit script generates one) |
| Business | corporation number, incorporation date, support phone, CRA business number, FINTRAC MSB number + expiry |
| Registered / operating address | street, unit, city, province, postal code (drop `operatingAddress` if identical and keep `sameAsRegistered: true`) |
| Representative | date of birth, email, phone, nationality, ownership %, ID type/number/issuing country/expiry, home address |
| Documents | public URLs for each file (see below) |
| Expected volumes | monthly inbound CAD, average transaction CAD |

## Hosting the documents

Fincra reads document **links**, not uploads. Options, cheapest first:

1. The existing private `partner-documents` Supabase bucket — upload, then create
   a long-lived signed URL and paste it in. Signed URLs expire, so set a window
   that covers Fincra's review (30+ days).
2. A shared Google Drive / Dropbox link set to "anyone with the link can view".

Do not paste credentials or unredacted ID scans anywhere else.

## Sending it (when you are ready)

Nothing here submits automatically. To send:

```powershell
$env:FINCRA_SECRET_KEY="api_live_..."
$env:FINCRA_PAYLOAD="docs\fincra\fincra-cad-va-request.corporate.json"
node scripts/submit-fincra-cad-va.mjs
```

Or through the admin edge function `fincra-cad-va-probe` with
`{ "action": "request", "payload": <this JSON> }`.

After approval, put the issued Interac alias into the
`FINCRA_CAD_INTERAC_ALIAS` secret (and `FINCRA_CAD_VIRTUAL_ACCOUNT_ID` if given)
so `resolveFincraCadAlias()` stops hitting the API on every checkout.
