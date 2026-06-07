## Plan: Add Terms & Conditions of Service page

The app references "Terms of Service" in the Auth screen and Landing footer but has no actual page. I'll add one populated verbatim from the uploaded document.

### Changes

1. **Create `src/pages/TermsPage.tsx`**
   - Reuse the structure/styling of `PrivacyPolicyPage.tsx` (sticky TOC, gradient header, card sections, back link, footer contact card).
   - Header metadata: Effective Date June 6, 2026; Jurisdiction Manitoba, Canada; Governing Law Manitoba & Canada; "FINTRAC-registered MSB" badge.
   - Render all 8 Parts / 21 Sections from the document:
     - Preamble
     - Part I — General Provisions: 1. Definitions, 2. Eligibility & Account Registration, 3. Description of Services
     - Part II — Financial Regulatory Compliance: 4. FINTRAC MSB Compliance, 5. AML/ATF, 6. Fraud Prevention & Security
     - Part III — Transaction Terms: 7. Fees & Charges, 8. Transaction Limits, 9. Chargebacks & Dispute Resolution, 10. FX Risk Disclosures
     - Part IV — Electronic Communications & Signatures: 11. Electronic Signature Consent, 12. Electronic Communications
     - Part V — Liability, Warranties, Indemnification: 13. Limitation of Liability, 14. Disclaimer of Warranties, 15. Indemnification
     - Part VI — Cross-Border Data Transfers & Data Governance: 16. Cross-Border Data Transfers
     - Part VII — Account Suspension & Termination: 17. Suspension & Termination
     - Part VIII — Governing Law & Dispute Resolution: 18. Governing Law, 19. Dispute Resolution, 20. Amendments, 21. Miscellaneous
   - Contact card: legal@, support@, compliance@, security@, disputes@efin.money — eFintax Advisors Ltd dba eFinMoney, Winnipeg, Manitoba.

2. **Register route in `src/App.tsx`**
   - Add `<Route path="/terms" element={<TermsPage />} />` next to `/privacy`.

3. **Wire existing references**
   - `src/pages/Landing.tsx` line 486: change footer `Terms` href from `"#"` to `/terms`.
   - `src/pages/Auth.tsx` line 159: turn "Terms of Service" into a `Link` to `/terms` (and "Privacy Policy" to `/privacy` for consistency).

### Out of scope
- No design-system changes; reuses existing tokens.
- No backend / DB changes.
- Document is rendered as React/JSX text — no docx file shipped in the app.
