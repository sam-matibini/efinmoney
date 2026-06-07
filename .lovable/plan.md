## Plan: Add Compliance Statement page (AML/CFT + EDD Framework)

Render the uploaded **EDD Compliance Framework** as a first-class public legal page, mirroring the structure of `TermsPage` / `PrivacyPolicyPage`, and reviewed against FINTRAC (PCMLTFA) requirements.

### 1. Create `src/pages/CompliancePage.tsx`
Reuse the `PrivacyPolicyPage` layout (sticky header, gradient hero, sticky TOC, card sections, contact footer).

**Header metadata**
- Title: "AML/CFT Compliance & Enhanced Due Diligence Framework"
- Effective Date: June 7, 2026 · Version 1.0
- Badges: "FINTRAC-registered MSB", "PCMLTFA Compliant", "FATF-aligned"
- Jurisdiction: Manitoba, Canada

**Sections (17, from the PDF, condensed and language-tightened for public disclosure):**
1. Compliance Governance Structure (Board oversight, CCO, MLRO, Risk Committee, Internal Audit)
2. AML/CFT Policy Statement (PCMLTFA, FINTRAC, OSFI, PIPEDA, FATF, PCI-DSS)
3. Customer Risk-Based Approach (Low → Prohibited tiers + scoring factors)
4. Enhanced Due Diligence (EDD) Procedures (PEPs, MSBs, crypto, high-risk jurisdictions; individual + business requirements incl. 25% UBO threshold)
5. Sanctions Compliance Program (Canadian Consolidated, UN, OFAC, UK/HMT, EU, internal lists; real-time + ongoing)
6. Transaction Monitoring Framework (structuring, velocity, mule indicators, device/IP anomalies)
7. Suspicious Transaction Reporting — STRs, Terrorist Property, LCTRs (≥ CAD 10k), EFTRs (≥ CAD 10k cross-border) per FINTRAC timelines
8. KYC & Identity Verification Standards (gov ID, NFC, liveness, biometric, ongoing monitoring)
9. Prohibited Customers & Activities
10. Record Retention Policy (5-year minimum, encrypted, retrievable)
11. AML/CFT Training Program (annual + role-based enhanced training)
12. Independent AML Audit (annual two-year effectiveness review per FINTRAC)
13. Cybersecurity & Data Protection (MFA, encryption at rest/in transit, SIEM, RBAC, pen-testing, IR; PCI-DSS / ISO 27001 / SOC 2)
14. Banking & Connectivity Due Diligence (entity, licensing, ownership, AML program, KYC, screening, monitoring, security, vendor, geo, products)
15. Connectivity Approval Readiness — documentary checklist (rendered as a styled table)
16. Compliance Technology Stack (KYC, AML monitoring, sanctions, fraud AI, case mgmt, audit; Stripe, Plaid, Interac, EFT/ACH, FINTRAC integrations)
17. Regulatory Alignment (FATF, FINTRAC MSB, ISO 27001, PCI-DSS, PIPEDA, Open Banking, AML/ATF best practices)

**FINTRAC compliance review additions** (gaps in source PDF — to be added in the rendered page so it meets current PCMLTFA requirements):
- Explicit naming of **FINTRAC** as the supervisory authority and reference to the **PCMLTFA & PCMLTFR**.
- **Two-year effectiveness review** language for Section 12 (per PCMLTFR s.156).
- **Reporting thresholds**: LCTR / LVCTR / EFTR at **CAD 10,000** (24-hour aggregation rule); STR has **no threshold**, filed "as soon as practicable" after reasonable grounds to suspect.
- **Travel Rule / "Sunrise" requirement** for EFTs ≥ CAD 1,000 (originator + beneficiary info).
- **Ministerial Directives & Sanctions** — explicit mention of SEMA, JVCFOA, Criminal Code listed terrorist entities, and UN Act regulations.
- **PEP/HIO determination** within 30 days for prescribed transactions; **senior management approval** for high-risk PEPs and review of source of wealth/funds.
- **Beneficial ownership** confirmed at **25% threshold** with reasonable measures to confirm accuracy.
- **Compliance Officer** designation as required by PCMLTFR; reports to Board.
- **Whistleblower / confidential reporting** channel.
- **No tipping-off** disclosure (s.8 PCMLTFA).

**Contact footer card**
- Compliance: compliance@efin.money
- MLRO / STR matters: mlro@efin.money
- Privacy (PIPEDA): privacy@efin.money
- General: info@efintax.biz
- eFintax Advisors Ltd. dba eFinMoney — Winnipeg, Manitoba, Canada — FINTRAC MSB

### 2. Routing — `src/App.tsx`
Add `<Route path="/compliance" element={<CompliancePage />} />` next to `/terms` and `/privacy`.

### 3. Wire references
- `src/pages/Landing.tsx` footer: add a **Compliance** link to `/compliance` alongside Terms/Privacy.
- `src/pages/TermsPage.tsx` (Section 4 — FINTRAC MSB Compliance) and `PrivacyPolicyPage.tsx`: add a sentence linking to `/compliance` for the full AML/CFT framework.

### Out of scope
- No design-system, backend, or DB changes.
- No PDF shipped — content is rendered as JSX text using existing tokens.
- No changes to existing AML edge functions or admin compliance panels.
