# Fincra CAD collection request — corporate payload

Goal: a ready-to-send corporate (business) payload for the Fincra CAD Interac collection account, saved in the repo and shown in chat. Nothing is submitted to Fincra.

## What gets created

`docs/fincra/fincra-cad-va-request.corporate.json` — a single JSON payload for
`POST /profile/virtual-accounts/requests` with `currency: "CAD"`, `accountType: "corporate"`.

Blocks in the payload:

- Account request: `currency`, `accountType`, `purpose` (third_party), `merchantReference`, `note`.
- Business identity: legal name (eFin Tax Advisors Ltd), trading name, incorporation/registration number, incorporation date, business type, industry, website, support email and phone.
- Registered + operating address: street, city, province, postal code, country CA.
- Director / representative: name, DOB, role, email, phone, nationality, government-ID type and number.
- Document links: certificate of incorporation, proof of address / utility bill, director ID, plus an optional AML/compliance policy — Fincra takes public URLs, not uploads.

Every value we do not already hold is written as an obvious `FILL_ME` placeholder, so nothing is invented. The file gets a short sibling `docs/fincra/README-cad-va.md` listing exactly which placeholders you must fill and where the document URLs can be hosted.

## What is shown in chat

The complete JSON, pretty-printed, so you can copy it straight into Fincra's portal or an email to your account manager.

## Not in this change

- No POST to Fincra, no edge-function call, no secrets touched.
- No change to `submit-fincra-cad-va.mjs`, `fincra-cad-va-submit`, or `fincra-cad-va-probe`. When you are ready to send it, the existing script already reads a payload path from `FINCRA_PAYLOAD`, so it can point at this new file with no code change.
- No database or UI changes.

## Technical notes

- The existing individual-KYC path (`KYCInformation`, `meansOfId`, `utilityBill`) stays untouched; the corporate payload uses the business/KYB shape instead and is a separate file.
- `merchantReference` is left as a placeholder pattern (`efm-cad-corp-<timestamp>`) since the submit script generates one when absent.
