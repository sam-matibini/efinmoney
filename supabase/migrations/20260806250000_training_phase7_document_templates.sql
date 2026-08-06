-- ==============================================================
-- Phase 7: Compliance document templates
-- Creates document_templates table and seeds 8 templates.
--
-- 1  ML/TF Business Risk Assessment (BRA)
-- 2  AML Compliance Program Shell
-- 3  STR Internal Escalation Form
-- 4  LCTR / EFTR Daily Transaction Log
-- 5  MSB Registration Checklist (FINTRAC)
-- 6  PSP Registration Checklist (RPAA)
-- 7  Daily Safeguarding Reconciliation Worksheet
-- 8  ORM & Incident Log
-- ==============================================================

CREATE TABLE IF NOT EXISTS public.document_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  category    text        NOT NULL DEFAULT 'compliance',
  content_html text       NOT NULL,
  version     text        NOT NULL DEFAULT '1.0',
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'document_templates' AND policyname = 'auth_read_document_templates'
  ) THEN
    CREATE POLICY "auth_read_document_templates" ON public.document_templates
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

GRANT SELECT ON public.document_templates TO authenticated;
GRANT ALL    ON public.document_templates TO service_role;

-- ---------------------------------------------------------------
-- Template 1 — ML/TF Business Risk Assessment
-- ---------------------------------------------------------------
INSERT INTO public.document_templates (name, description, category, version, sort_order, content_html)
VALUES (
  'ML/TF Business Risk Assessment',
  'Four-section risk register covering client, product/service, delivery channel, and geographic risk. Residual risk vs. risk-appetite gap triggers remediation planning.',
  'compliance', '1.0', 10,
  $tpl1$
<h1 style="margin-bottom:4px">ML/TF Business Risk Assessment</h1>
<p style="color:#666;font-size:13px;margin-top:0">PCMLTFR s.9(1)(c) — Mandatory element of the five-element compliance program. Review at least annually and upon any material change.</p>
<table style="margin-bottom:16px">
  <tr><td style="width:160px"><strong>Entity name:</strong></td><td style="width:260px"></td><td style="width:140px"><strong>Period covered:</strong></td><td></td></tr>
  <tr><td><strong>Prepared by:</strong></td><td></td><td><strong>Date prepared:</strong></td><td></td></tr>
  <tr><td><strong>Reviewed/approved by:</strong></td><td></td><td><strong>Next review date:</strong></td><td></td></tr>
</table>
<h2>Rating Key</h2>
<table style="margin-bottom:16px">
  <tr><th style="width:60px">Score</th><th>Inherent Risk Level</th><th>Control Effectiveness</th></tr>
  <tr><td>1</td><td>Low</td><td>Very effective — control is documented, tested, operating consistently</td></tr>
  <tr><td>2</td><td>Low-Medium</td><td>Effective — minor gaps but not material</td></tr>
  <tr><td>3</td><td>Medium</td><td>Partially effective — gaps identified, remediation planned</td></tr>
  <tr><td>4</td><td>Medium-High</td><td>Marginally effective — significant gaps, urgent remediation needed</td></tr>
  <tr><td>5</td><td>High</td><td>Ineffective — control is absent or routinely bypassed</td></tr>
</table>
<p style="font-size:12px;color:#555"><strong>Residual Risk</strong> = Inherent Risk × (1 – Control Effectiveness adjustment). Use judgment to rate L / M / H.</p>

<h2>Section 1 — Client Risk</h2>
<table>
  <tr><th>Client Category</th><th style="width:80px">Inherent Risk (1–5)</th><th>Controls in Place</th><th style="width:80px">Effectiveness (1–5)</th><th style="width:70px">Residual Risk (L/M/H)</th></tr>
  <tr><td>Politically Exposed Persons (PEPs) and HIOs</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Clients from FATF grey / black-list jurisdictions</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Cash-intensive businesses (restaurant, retail, etc.)</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Third-party senders (agent, introducer, hawaladar)</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>New clients with no established history</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Standard retail / individual clients</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Corporate clients — private companies</td><td></td><td></td><td></td><td></td></tr>
  <tr><td><em>Other (describe):</em></td><td></td><td></td><td></td><td></td></tr>
</table>

<h2>Section 2 — Product / Service Risk</h2>
<table>
  <tr><th>Product / Service</th><th style="width:80px">Inherent Risk (1–5)</th><th>Controls in Place</th><th style="width:80px">Effectiveness (1–5)</th><th style="width:70px">Residual Risk (L/M/H)</th></tr>
  <tr><td>International funds transfer (remittances)</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Foreign exchange dealing (cash conversion)</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Virtual currency — buy / sell</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Money orders / traveller's cheques</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Domestic funds transfer</td><td></td><td></td><td></td><td></td></tr>
  <tr><td><em>Other (describe):</em></td><td></td><td></td><td></td><td></td></tr>
</table>

<h2>Section 3 — Delivery Channel Risk</h2>
<table>
  <tr><th>Channel</th><th style="width:80px">Inherent Risk (1–5)</th><th>Controls in Place</th><th style="width:80px">Effectiveness (1–5)</th><th style="width:70px">Residual Risk (L/M/H)</th></tr>
  <tr><td>In-person (branch / retail location)</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Online — web portal</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Online — mobile application</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Third-party agent network</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Telephone / call centre</td><td></td><td></td><td></td><td></td></tr>
</table>

<h2>Section 4 — Geographic Risk</h2>
<table>
  <tr><th>Jurisdiction / Corridor</th><th style="width:100px">FATF Listing</th><th style="width:80px">Inherent Risk (1–5)</th><th>Controls in Place</th><th style="width:80px">Effectiveness (1–5)</th><th style="width:70px">Residual Risk (L/M/H)</th></tr>
  <tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
</table>

<h2>Overall Risk Summary &amp; Remediation Plan</h2>
<table>
  <tr><th>Risk Category</th><th>Overall Residual Rating</th><th>Exceeds Risk Appetite?</th><th>Remediation Action &amp; Owner</th><th>Target Date</th></tr>
  <tr><td>Client risk</td><td></td><td>&#9744; Yes &nbsp; &#9744; No</td><td></td><td></td></tr>
  <tr><td>Product / service risk</td><td></td><td>&#9744; Yes &nbsp; &#9744; No</td><td></td><td></td></tr>
  <tr><td>Delivery channel risk</td><td></td><td>&#9744; Yes &nbsp; &#9744; No</td><td></td><td></td></tr>
  <tr><td>Geographic risk</td><td></td><td>&#9744; Yes &nbsp; &#9744; No</td><td></td><td></td></tr>
  <tr><td><strong>Overall entity ML/TF risk rating</strong></td><td><strong></strong></td><td colspan="3"></td></tr>
</table>

<h2>Approval</h2>
<table>
  <tr><td style="width:200px"><strong>Compliance Officer:</strong></td><td style="width:220px"></td><td style="width:80px"><strong>Date:</strong></td><td></td></tr>
  <tr><td><strong>Senior Management:</strong></td><td></td><td><strong>Date:</strong></td><td></td></tr>
</table>
  $tpl1$
);

-- ---------------------------------------------------------------
-- Template 2 — AML Compliance Program Shell
-- ---------------------------------------------------------------
INSERT INTO public.document_templates (name, description, category, version, sort_order, content_html)
VALUES (
  'AML/ATF Compliance Program Shell',
  'Five-element program framework with prompts for each required element — compliance officer, policies, risk assessment, training, and effectiveness review.',
  'compliance', '1.0', 20,
  $tpl2$
<h1 style="margin-bottom:4px">AML/ATF Compliance Program</h1>
<p style="color:#666;font-size:13px;margin-top:0">Five-element framework required under PCMLTFR s.9. This shell defines the scope, ownership, and schedule for each element. Attach your actual policies as appendices.</p>
<table style="margin-bottom:16px">
  <tr><td style="width:160px"><strong>Entity name:</strong></td><td style="width:260px"></td><td style="width:140px"><strong>Effective date:</strong></td><td></td></tr>
  <tr><td><strong>MSB Registration #:</strong></td><td></td><td><strong>Approved by:</strong></td><td></td></tr>
  <tr><td><strong>Version:</strong></td><td></td><td><strong>Next review date:</strong></td><td></td></tr>
</table>

<h2>Element 1 — Compliance Officer</h2>
<table style="margin-bottom:16px">
  <tr><td style="width:200px"><strong>Designated Compliance Officer:</strong></td><td></td></tr>
  <tr><td><strong>Title:</strong></td><td></td></tr>
  <tr><td><strong>Designation date:</strong></td><td></td></tr>
  <tr><td><strong>Board resolution reference:</strong></td><td></td></tr>
  <tr><td><strong>Reporting line:</strong></td><td></td></tr>
  <tr><td><strong>Key responsibilities:</strong></td><td>Day-to-day program oversight; FINTRAC reporting sign-off; exam preparation; training oversight; policy maintenance; risk assessment maintenance.</td></tr>
</table>

<h2>Element 2 — Policies and Procedures</h2>
<p>The following policies are in place. Each has a designated owner, effective date, and review cycle.</p>
<table style="margin-bottom:16px">
  <tr><th>Policy / Procedure</th><th>Owner</th><th>Effective Date</th><th>Next Review</th><th>&#9744; In Place</th></tr>
  <tr><td>AML/ATF Policy (master)</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Client Identification &amp; Verification Procedure</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>PEP &amp; HIO Identification Procedure</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Beneficial Ownership Procedure</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Third-Party Determination Procedure</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>STR Assessment &amp; Reporting Procedure</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>LCTR Reporting Procedure</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>EFTR Reporting Procedure</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Transaction Monitoring Procedure</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Sanctions Screening Procedure</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Record Keeping &amp; Retention Procedure</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>Training Procedure</td><td></td><td></td><td></td><td></td></tr>
</table>

<h2>Element 3 — Risk Assessment</h2>
<table style="margin-bottom:16px">
  <tr><td style="width:220px"><strong>Risk assessment document title:</strong></td><td>ML/TF Business Risk Assessment — see attached</td></tr>
  <tr><td><strong>Date of current assessment:</strong></td><td></td></tr>
  <tr><td><strong>Next scheduled review:</strong></td><td></td></tr>
  <tr><td><strong>Trigger-based review events:</strong></td><td>New product launch; new corridor opened; FATF list update; material change in client base; new FINTRAC guidance issued.</td></tr>
  <tr><td><strong>Overall ML/TF risk rating:</strong></td><td>&#9744; Low &nbsp; &#9744; Medium &nbsp; &#9744; High</td></tr>
</table>

<h2>Element 4 — Training Program</h2>
<p>Training matrix — mark required (R) or not applicable (—) for each role and module.</p>
<table style="margin-bottom:16px">
  <tr><th>Training Module</th><th>Frequency</th><th>All Front-Line Staff</th><th>Operations</th><th>Compliance / Finance</th><th>Management</th></tr>
  <tr><td>AML/ATF Fundamentals</td><td>Annual</td><td>R</td><td>R</td><td>R</td><td>R</td></tr>
  <tr><td>Client Identification Procedures</td><td>Annual</td><td>R</td><td>R</td><td>R</td><td>—</td></tr>
  <tr><td>STR Recognition &amp; Reporting</td><td>Annual</td><td>R</td><td>—</td><td>R</td><td>R</td></tr>
  <tr><td>LCTR / EFTR Procedures</td><td>Annual</td><td>—</td><td>R</td><td>R</td><td>—</td></tr>
  <tr><td>Sanctions Screening</td><td>Annual</td><td>R</td><td>R</td><td>R</td><td>—</td></tr>
  <tr><td>PEP &amp; High-Risk Client Procedures</td><td>Annual</td><td>—</td><td>—</td><td>R</td><td>R</td></tr>
  <tr><td>New-hire orientation (AML)</td><td>On hire</td><td>R</td><td>R</td><td>R</td><td>R</td></tr>
  <tr><td><em>Other:</em></td><td></td><td></td><td></td><td></td><td></td></tr>
</table>

<h2>Element 5 — Effectiveness Review</h2>
<table style="margin-bottom:16px">
  <tr><td style="width:220px"><strong>Review frequency:</strong></td><td>At least every two years (PCMLTFR s.9(2))</td></tr>
  <tr><td><strong>Next scheduled review:</strong></td><td></td></tr>
  <tr><td><strong>Reviewer (must be independent of daily compliance):</strong></td><td></td></tr>
  <tr><td><strong>Scope:</strong></td><td>All five elements; FINTRAC reporting completeness; client identification sampling; monitoring program adequacy; training records.</td></tr>
  <tr><td><strong>Report to:</strong></td><td>Senior management + board (for material findings)</td></tr>
</table>

<h2>Review History</h2>
<table>
  <tr><th>Review Date</th><th>Reviewer</th><th>Material Changes</th><th>Approved By</th></tr>
  <tr><td></td><td></td><td></td><td></td></tr>
  <tr><td></td><td></td><td></td><td></td></tr>
</table>
  $tpl2$
);

-- ---------------------------------------------------------------
-- Template 3 — STR Internal Escalation Form
-- ---------------------------------------------------------------
INSERT INTO public.document_templates (name, description, category, version, sort_order, content_html)
VALUES (
  'STR Internal Escalation Form',
  'Two-part form: Part A completed by the staff member identifying suspicious activity; Part B is the compliance officer''s filing decision with rationale. Includes tipping-off reminder.',
  'compliance', '1.0', 30,
  $tpl3$
<h1 style="margin-bottom:4px">Suspicious Transaction — Internal Escalation Form</h1>
<p style="color:#c00;font-weight:bold;border:1px solid #c00;padding:8px;margin-bottom:16px">CONFIDENTIAL — TIPPING-OFF PROHIBITION APPLIES: Do not disclose to the client or any third party that this form has been completed or that a report has been or may be filed. Disclosure is a criminal offence under PCMLTFA s.8.</p>

<h2>Part A — Completed by Escalating Staff Member</h2>
<p style="font-size:12px;color:#555">Complete this section as soon as reasonable grounds for suspicion arise. Submit to the Compliance Officer immediately — do not delay.</p>
<table style="margin-bottom:16px">
  <tr><td style="width:200px"><strong>Staff name:</strong></td><td></td><td style="width:120px"><strong>Date / time:</strong></td><td></td></tr>
  <tr><td><strong>Staff role / location:</strong></td><td></td><td><strong>Form reference #:</strong></td><td></td></tr>
</table>

<h3>Client Details</h3>
<table style="margin-bottom:12px">
  <tr><td style="width:200px"><strong>Client name:</strong></td><td></td><td style="width:120px"><strong>Client ID #:</strong></td><td></td></tr>
  <tr><td><strong>Account / reference #:</strong></td><td></td><td><strong>Client since:</strong></td><td></td></tr>
  <tr><td><strong>Nationality / country of birth:</strong></td><td></td><td><strong>Occupation / business:</strong></td><td></td></tr>
</table>

<h3>Transaction Details</h3>
<table style="margin-bottom:12px">
  <tr><td style="width:200px"><strong>Transaction date:</strong></td><td></td><td style="width:120px"><strong>Amount (CAD):</strong></td><td></td></tr>
  <tr><td><strong>Transaction type:</strong></td><td>&#9744; Cash &nbsp; &#9744; Wire/EFT &nbsp; &#9744; VC &nbsp; &#9744; FX &nbsp; &#9744; Other:</td><td><strong>Destination country:</strong></td><td></td></tr>
  <tr><td><strong>Beneficiary name:</strong></td><td></td><td><strong>Beneficiary bank:</strong></td><td></td></tr>
  <tr><td><strong>Stated purpose:</strong></td><td colspan="3"></td></tr>
</table>

<h3>Description of Suspicious Activity</h3>
<p style="font-size:12px;color:#555">Describe the specific transaction behaviour or indicators that prompted escalation. Be factual and specific — avoid opinions or conclusions. Reference FINTRAC ML/TF indicators where applicable.</p>
<table style="margin-bottom:12px">
  <tr><td style="height:80px;vertical-align:top"><strong>Observed behaviour:</strong></td><td></td></tr>
  <tr><td style="vertical-align:top"><strong>Relevant ML/TF indicators:</strong></td><td></td></tr>
  <tr><td style="vertical-align:top"><strong>Additional context:</strong></td><td></td></tr>
</table>

<h3>Staff Recommendation</h3>
<p>&#9744; File an STR &nbsp;&nbsp; &#9744; Do not file (explain in additional context above) &nbsp;&nbsp; &#9744; Require additional information before decision</p>
<table>
  <tr><td style="width:200px"><strong>Staff signature:</strong></td><td></td><td style="width:120px"><strong>Date:</strong></td><td></td></tr>
</table>

<hr style="margin:20px 0" />

<h2>Part B — Compliance Officer Decision</h2>
<p style="font-size:12px;color:#555">To be completed by the Compliance Officer within [X] business days of receiving Part A. The 30-day STR clock runs from the date reasonable grounds arose (Part A date or earlier).</p>
<table style="margin-bottom:12px">
  <tr><td style="width:200px"><strong>Date received from staff:</strong></td><td></td><td style="width:120px"><strong>Date reviewed:</strong></td><td></td></tr>
</table>

<h3>Investigation Summary</h3>
<table style="margin-bottom:12px">
  <tr><td style="height:60px;vertical-align:top;width:200px"><strong>Additional investigation steps taken:</strong></td><td></td></tr>
  <tr><td style="vertical-align:top"><strong>Other transactions reviewed:</strong></td><td></td></tr>
</table>

<h3>Filing Decision</h3>
<p>&#9744; <strong>FILE STR</strong> — reasonable grounds to suspect ML/TF exist. &nbsp;&nbsp; &#9744; <strong>DO NOT FILE</strong> — grounds do not meet the reasonable grounds threshold.</p>
<table style="margin-bottom:12px">
  <tr><td style="height:60px;vertical-align:top;width:200px"><strong>Rationale for decision:</strong></td><td></td></tr>
</table>

<h3>If STR Filed</h3>
<table style="margin-bottom:16px">
  <tr><td style="width:200px"><strong>Date STR filed in F2R:</strong></td><td></td><td style="width:120px"><strong>F2R reference #:</strong></td><td></td></tr>
  <tr><td><strong>Account / relationship action:</strong></td><td>&#9744; No change &nbsp; &#9744; Enhanced monitoring &nbsp; &#9744; Relationship exited &nbsp; &#9744; Other:</td><td></td><td></td></tr>
</table>

<table>
  <tr><td style="width:200px"><strong>Compliance Officer signature:</strong></td><td></td><td style="width:120px"><strong>Date:</strong></td><td></td></tr>
</table>
<p style="font-size:11px;color:#666;margin-top:8px">Retain this form for 5 years from the date of completion. Store in a confidential compliance file — do not include in the client file accessible to non-compliance staff.</p>
  $tpl3$
);

-- ---------------------------------------------------------------
-- Template 4 — LCTR / EFTR Daily Transaction Log
-- ---------------------------------------------------------------
INSERT INTO public.document_templates (name, description, category, version, sort_order, content_html)
VALUES (
  'LCTR / EFTR Daily Transaction Log',
  'Operations log for tracking large cash (LCTR ≥$10 k) and electronic fund transfers (EFTR ≥$10 k) subject to FINTRAC reporting, including 24-hour aggregation tracking and Travel Rule flag.',
  'compliance', '1.0', 40,
  $tpl4$
<h1 style="margin-bottom:4px">LCTR / EFTR Daily Transaction Log</h1>
<p style="color:#666;font-size:13px;margin-top:0">LCTR threshold: $10,000 CAD cash received or sent (aggregate within 24 hours per client). EFTR threshold: $10,000 CAD single EFT. Travel Rule trigger: &#8805;$1,000 CAD. Filing deadline: LCTR within 15 calendar days; EFTR within 5 business days.</p>

<table style="margin-bottom:16px">
  <tr><td style="width:120px"><strong>Log date:</strong></td><td style="width:200px"></td><td style="width:120px"><strong>Branch / location:</strong></td><td></td></tr>
  <tr><td><strong>Opened by:</strong></td><td></td><td><strong>Closed by:</strong></td><td></td></tr>
</table>

<h2>Transaction Register</h2>
<p style="font-size:12px;color:#555">Enter every cash transaction &#8805; $3,000 and every EFT &#8805; $1,000. The 24-hour aggregate column accumulates same-client cash across the day to detect when the LCTR threshold is reached.</p>
<table style="font-size:12px">
  <tr>
    <th style="width:55px">Time</th>
    <th>Client Name</th>
    <th style="width:80px">Client ID #</th>
    <th style="width:70px">Type<br/>(Cash/EFT/VC/FX)</th>
    <th style="width:80px">Amount (CAD)</th>
    <th style="width:80px">24h Cash Aggregate (same client)</th>
    <th style="width:90px">Beneficiary / Originator Name</th>
    <th style="width:70px">Destination / Origin Country</th>
    <th style="width:55px">Travel Rule &#9744;</th>
    <th style="width:70px">Report Required? (LCTR / EFTR / None)</th>
    <th style="width:70px">F2R Ref #</th>
    <th style="width:45px">Initials</th>
  </tr>
  <tr><td style="height:26px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td style="height:26px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td style="height:26px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td style="height:26px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td style="height:26px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td style="height:26px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td style="height:26px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td style="height:26px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td style="height:26px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td style="height:26px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
</table>

<h2>End-of-Day Summary</h2>
<table style="margin-bottom:16px">
  <tr><td style="width:260px"><strong>Total cash transactions entered:</strong></td><td></td></tr>
  <tr><td><strong>LCTRs identified (threshold reached):</strong></td><td></td></tr>
  <tr><td><strong>EFTRs identified:</strong></td><td></td></tr>
  <tr><td><strong>Travel Rule triggered (&#8805;$1,000 EFTs):</strong></td><td></td></tr>
  <tr><td><strong>Reports filed today in F2R:</strong></td><td></td></tr>
  <tr><td><strong>Pending reports (filing deadline not yet reached):</strong></td><td></td></tr>
  <tr><td><strong>Anomalies / escalations noted:</strong></td><td></td></tr>
</table>

<table>
  <tr><td style="width:200px"><strong>Operations staff signature:</strong></td><td></td><td style="width:120px"><strong>Time:</strong></td><td></td></tr>
  <tr><td><strong>Supervisor reviewed by:</strong></td><td></td><td><strong>Date:</strong></td><td></td></tr>
</table>
<p style="font-size:11px;color:#666;margin-top:8px">Retain this log for 5 years. LCTR must be filed within 15 calendar days of the transaction date. EFTR must be filed within 5 business days.</p>
  $tpl4$
);

-- ---------------------------------------------------------------
-- Template 5 — MSB Registration Checklist (FINTRAC)
-- ---------------------------------------------------------------
INSERT INTO public.document_templates (name, description, category, version, sort_order, content_html)
VALUES (
  'MSB Registration Checklist (FINTRAC)',
  'Step-by-step checklist for initial FINTRAC MSB registration, activity scoping, post-registration setup, and the annual renewal workflow.',
  'compliance', '1.0', 50,
  $tpl5$
<h1 style="margin-bottom:4px">FINTRAC MSB Registration Checklist</h1>
<p style="color:#666;font-size:13px;margin-top:0">Required before commencing any MSB activity. Operating without a valid registration is a violation of PCMLTFA s.54. Annual renewal is mandatory.</p>
<table style="margin-bottom:16px">
  <tr><td style="width:160px"><strong>Entity legal name:</strong></td><td></td><td style="width:120px"><strong>Date commenced:</strong></td><td></td></tr>
  <tr><td><strong>Compliance Officer:</strong></td><td></td><td><strong>Checklist completed by:</strong></td><td></td></tr>
</table>

<h2>Phase 1 — Pre-Registration: Activity Scoping</h2>
<table style="margin-bottom:16px">
  <tr><th style="width:30px">&#9744;</th><th>Task</th><th style="width:200px">Notes / Evidence</th></tr>
  <tr><td></td><td>Identify all MSB activities conducted as a business: foreign exchange; funds transfer; money orders / traveller's cheques; virtual currency; crowdfunding platform.</td><td></td></tr>
  <tr><td></td><td>Document the scoping analysis in writing — confirm which activities apply and why, signed by the Compliance Officer.</td><td></td></tr>
  <tr><td></td><td>Confirm the entity is not exempt (e.g., federally regulated financial institution exempt under PCMLTFA s.54(3)).</td><td></td></tr>
  <tr><td></td><td>Identify all trade names used in client-facing materials — all must be registered with FINTRAC.</td><td></td></tr>
  <tr><td></td><td>Identify all principal business locations (head office + any branches or agent locations).</td><td></td></tr>
</table>

<h2>Phase 2 — Completing the Online Registration</h2>
<table style="margin-bottom:16px">
  <tr><th style="width:30px">&#9744;</th><th>Task</th><th style="width:200px">Notes / Evidence</th></tr>
  <tr><td></td><td>Navigate to the FINTRAC MSB registration portal: fintrac-canafe.gc.ca/msb-esm/msb-eng</td><td></td></tr>
  <tr><td></td><td>Complete entity information: legal name, all trade names, head office address, phone, email.</td><td></td></tr>
  <tr><td></td><td>Select all applicable MSB activity categories (do not under-select — include all activities identified in Phase 1).</td><td></td></tr>
  <tr><td></td><td>Complete Compliance Officer information (name, title, contact details).</td><td></td></tr>
  <tr><td></td><td>Submit registration and save the confirmation email and registration number.</td><td></td></tr>
  <tr><td></td><td>Record MSB registration number: ___________________________</td><td></td></tr>
</table>

<h2>Phase 3 — Post-Registration Setup</h2>
<table style="margin-bottom:16px">
  <tr><th style="width:30px">&#9744;</th><th>Task</th><th style="width:200px">Notes / Evidence</th></tr>
  <tr><td></td><td>Verify registration appears in the public FINTRAC MSB registry: fintrac-canafe.gc.ca/msb-esm/public</td><td></td></tr>
  <tr><td></td><td>Display registration number on all client-facing materials and locations as required.</td><td></td></tr>
  <tr><td></td><td>Set annual renewal calendar reminder: registration expires 12 months from issuance.</td><td>Renewal date: _______________</td></tr>
  <tr><td></td><td>Set 30-day update reminders for changes: new activity, name change, address change, new trade name, Compliance Officer change.</td><td></td></tr>
  <tr><td></td><td>Commence compliance program activities (risk assessment, policies, training) before accepting first transaction.</td><td></td></tr>
  <tr><td></td><td>Register for FINTRAC F2R reporting portal access: fintrac-canafe.gc.ca/reporting-declaration</td><td></td></tr>
</table>

<h2>Annual Renewal Checklist (complete each year)</h2>
<table>
  <tr><th style="width:30px">&#9744;</th><th>Task</th><th style="width:200px">Notes / Evidence</th></tr>
  <tr><td></td><td>Log into the MSB registration portal and initiate annual renewal before the expiry date.</td><td>Renewal submitted: ___________</td></tr>
  <tr><td></td><td>Confirm all activity categories are still accurate — add or remove activities as applicable.</td><td></td></tr>
  <tr><td></td><td>Confirm all trade names, locations, and contact information are current.</td><td></td></tr>
  <tr><td></td><td>Confirm Compliance Officer details are current.</td><td></td></tr>
  <tr><td></td><td>Save renewal confirmation. Update the registry verification screenshot.</td><td></td></tr>
  <tr><td></td><td>Set next year's renewal reminder.</td><td>Next renewal date: ___________</td></tr>
</table>
  $tpl5$
);

-- ---------------------------------------------------------------
-- Template 6 — PSP Registration Checklist (RPAA)
-- ---------------------------------------------------------------
INSERT INTO public.document_templates (name, description, category, version, sort_order, content_html)
VALUES (
  'PSP Registration Checklist (RPAA)',
  'Step-by-step checklist for RPAA PSP registration via PSPConnect — scoping, safeguarding account setup, ORM attestation, submission, and ongoing obligations calendar.',
  'compliance', '1.0', 60,
  $tpl6$
<h1 style="margin-bottom:4px">RPAA PSP Registration Checklist</h1>
<p style="color:#666;font-size:13px;margin-top:0">Required before commencing any retail payment activity under the Retail Payment Activities Act. Registration is through PSPConnect (rps.bankofcanada.ca). Initial registration fee: $2,500.</p>
<table style="margin-bottom:16px">
  <tr><td style="width:160px"><strong>Entity legal name:</strong></td><td></td><td style="width:120px"><strong>Date commenced:</strong></td><td></td></tr>
  <tr><td><strong>Compliance Officer:</strong></td><td></td><td><strong>Checklist completed by:</strong></td><td></td></tr>
</table>

<h2>Phase 1 — Pre-Registration: Scoping</h2>
<table style="margin-bottom:16px">
  <tr><th style="width:30px">&#9744;</th><th>Task</th><th style="width:200px">Notes / Evidence</th></tr>
  <tr><td></td><td>Confirm the entity performs at least one retail payment activity: holds end-user funds; maintains an account holding end-user funds; initiates a payment order at an end user's request; authorises a payment order; clears or settles payment obligations.</td><td></td></tr>
  <tr><td></td><td>Confirm at least one Canadian end user (located in Canada or a Canadian person transacting cross-border).</td><td></td></tr>
  <tr><td></td><td>Document scoping analysis — signed by the Compliance Officer.</td><td></td></tr>
  <tr><td></td><td>Confirm entity is not exempt (e.g., CDIC member institution).</td><td></td></tr>
</table>

<h2>Phase 2 — Safeguarding Account Setup</h2>
<table style="margin-bottom:16px">
  <tr><th style="width:30px">&#9744;</th><th>Task</th><th style="width:200px">Notes / Evidence</th></tr>
  <tr><td></td><td>Open a dedicated safeguarding account at a CDIC-member institution (separate from operating accounts).</td><td>Institution: _____________<br/>Account #: _______________</td></tr>
  <tr><td></td><td>Obtain written confirmation from the bank that the account is designated as a PSP client safeguarding account.</td><td></td></tr>
  <tr><td></td><td>Confirm CDIC coverage against expected average and peak end-user fund levels. Arrange additional accounts or eligible securities if coverage gap exists.</td><td></td></tr>
  <tr><td></td><td>Draft safeguarding policy (commingling prohibition, reconciliation procedure, shortfall response).</td><td></td></tr>
  <tr><td></td><td>Test the daily reconciliation procedure with a sample dataset.</td><td></td></tr>
</table>

<h2>Phase 3 — ORM Framework</h2>
<table style="margin-bottom:16px">
  <tr><th style="width:30px">&#9744;</th><th>Task</th><th style="width:200px">Notes / Evidence</th></tr>
  <tr><td></td><td>Document the ORM framework: governance, risk register, BCP, incident classification table, notification workflow.</td><td></td></tr>
  <tr><td></td><td>Confirm board has approved the ORM framework and risk appetite statement.</td><td></td></tr>
  <tr><td></td><td>Ensure PSPConnect credentials are available to the Compliance Officer for incident notifications.</td><td></td></tr>
  <tr><td></td><td>Conduct at least one tabletop exercise to confirm the notification workflow is understood.</td><td></td></tr>
</table>

<h2>Phase 4 — PSPConnect Registration Submission</h2>
<table style="margin-bottom:16px">
  <tr><th style="width:30px">&#9744;</th><th>Task</th><th style="width:200px">Notes / Evidence</th></tr>
  <tr><td></td><td>Navigate to PSPConnect: rps.bankofcanada.ca</td><td></td></tr>
  <tr><td></td><td>Complete entity information and description of retail payment activities.</td><td></td></tr>
  <tr><td></td><td>Complete safeguarding section: eligible accounts, average fund levels.</td><td></td></tr>
  <tr><td></td><td>Attest to ORM framework compliance.</td><td></td></tr>
  <tr><td></td><td>Pay $2,500 initial registration fee.</td><td>Receipt reference: ___________</td></tr>
  <tr><td></td><td>Submit and save PSP registration number.</td><td>PSP #: ___________________</td></tr>
  <tr><td></td><td>Verify registration in the BoC public PSP registry.</td><td></td></tr>
</table>

<h2>Phase 5 — Ongoing Obligations Calendar</h2>
<table>
  <tr><th>Obligation</th><th>Deadline</th><th>Owner</th><th>&#9744; Scheduled</th></tr>
  <tr><td>Annual report (covering prior calendar year)</td><td>March 31 annually</td><td></td><td></td></tr>
  <tr><td>Daily safeguarding reconciliation</td><td>Every business day</td><td></td><td></td></tr>
  <tr><td>Initial incident notification (notifiable incidents)</td><td>Within 24 hours of awareness</td><td></td><td></td></tr>
  <tr><td>Detailed incident notification</td><td>Within 72 hours of awareness</td><td></td><td></td></tr>
  <tr><td>Significant change pre-notification</td><td>Before implementation</td><td></td><td></td></tr>
  <tr><td>Annual ORM / safeguarding review</td><td>Annually</td><td></td><td></td></tr>
  <tr><td>Tabletop exercise (incident response)</td><td>Annually</td><td></td><td></td></tr>
</table>
  $tpl6$
);

-- ---------------------------------------------------------------
-- Template 7 — Daily Safeguarding Reconciliation Worksheet
-- ---------------------------------------------------------------
INSERT INTO public.document_templates (name, description, category, version, sort_order, content_html)
VALUES (
  'Daily Safeguarding Reconciliation Worksheet',
  'RPAA-required daily worksheet comparing outstanding end-user funds against the safeguarding account balance. Includes a shortfall escalation section and supervisor sign-off.',
  'compliance', '1.0', 70,
  $tpl7$
<h1 style="margin-bottom:4px">Daily Safeguarding Reconciliation Worksheet</h1>
<p style="color:#666;font-size:13px;margin-top:0">Required daily under the RPAA. The safeguarding account balance must always be &#8805; the total outstanding end-user funds. A shortfall is a compliance breach requiring immediate escalation.</p>

<table style="margin-bottom:16px">
  <tr><td style="width:160px"><strong>Reconciliation date:</strong></td><td style="width:200px"></td><td style="width:120px"><strong>Reconciler name:</strong></td><td></td></tr>
  <tr><td><strong>Safeguarding institution:</strong></td><td></td><td><strong>Account #:</strong></td><td></td></tr>
</table>

<h2>Step 1 — Outstanding End-User Funds</h2>
<p style="font-size:12px;color:#555">Pull from the transaction system: all funds received from clients for which delivery to the beneficiary has not yet been confirmed as of end of business today.</p>
<table style="margin-bottom:16px">
  <tr><td style="width:300px"><strong>Outstanding transfers awaiting delivery:</strong></td><td style="width:160px">$ ___________________</td></tr>
  <tr><td><strong>Funds received today not yet dispatched:</strong></td><td>$ ___________________</td></tr>
  <tr><td><strong>Refunds pending return to clients:</strong></td><td>$ ___________________</td></tr>
  <tr><td><strong>Other end-user funds held (describe):</strong></td><td>$ ___________________</td></tr>
  <tr><td><strong>TOTAL OUTSTANDING END-USER FUNDS (A):</strong></td><td><strong>$ ___________________</strong></td></tr>
</table>

<h2>Step 2 — Safeguarding Account Balance</h2>
<p style="font-size:12px;color:#555">Retrieve the closing balance from the bank (online banking / bank statement). Do not use a projected balance — use the actual confirmed balance.</p>
<table style="margin-bottom:16px">
  <tr><td style="width:300px"><strong>Safeguarding account closing balance (B):</strong></td><td style="width:160px"><strong>$ ___________________</strong></td></tr>
  <tr><td><strong>Balance verified from (source):</strong></td><td>&#9744; Online banking &nbsp; &#9744; Bank statement &nbsp; &#9744; Bank email confirmation</td></tr>
</table>

<h2>Step 3 — Reconciliation Result</h2>
<table style="margin-bottom:16px">
  <tr><td style="width:300px"><strong>Difference (B minus A):</strong></td><td style="width:160px"><strong>$ ___________________</strong></td></tr>
  <tr><td><strong>Status:</strong></td><td>&#9744; <strong>COMPLIANT</strong> (B &#8805; A — surplus or exact match) &nbsp;&nbsp; &#9744; <strong>SHORTFALL</strong> (B &lt; A — breach, escalate immediately)</td></tr>
</table>

<div style="border:2px solid #c00;padding:12px;margin-bottom:16px;display:none" id="shortfall-section">
<h2 style="color:#c00;margin-top:0">SHORTFALL RESPONSE (complete only if shortfall identified)</h2>
<table>
  <tr><td style="width:260px"><strong>Shortfall amount:</strong></td><td>$ ___________________</td></tr>
  <tr><td><strong>Time shortfall detected:</strong></td><td></td></tr>
  <tr><td><strong>Compliance Officer notified at:</strong></td><td></td></tr>
  <tr><td><strong>CFO notified at:</strong></td><td></td></tr>
  <tr><td><strong>Probable cause:</strong></td><td>&#9744; Timing — funds in transit &nbsp; &#9744; Bank processing delay &nbsp; &#9744; Accounting error &nbsp; &#9744; Fund loss (escalate to CEO + board)</td></tr>
  <tr><td><strong>Corrective action taken:</strong></td><td></td></tr>
  <tr><td><strong>Time shortfall resolved:</strong></td><td></td></tr>
  <tr><td><strong>BoC notification required?</strong></td><td>&#9744; Yes (notifiable incident — initiate 24h notification) &nbsp; &#9744; No (timing only, resolved same day)</td></tr>
</table>
</div>

<p style="background:#fffbe6;border:1px solid #f0d000;padding:8px;font-size:12px"><strong>Note:</strong> If a shortfall is identified, complete the Shortfall Response section above. Repeated shortfalls — even small ones — indicate a systemic control failure and must be reported to the Compliance Officer for root cause analysis.</p>

<h2>Supervisor Review</h2>
<table>
  <tr><td style="width:260px"><strong>Reconciler signature:</strong></td><td></td><td style="width:100px"><strong>Time:</strong></td><td></td></tr>
  <tr><td><strong>Supervisor / Compliance Officer review:</strong></td><td></td><td><strong>Date:</strong></td><td></td></tr>
  <tr><td><strong>Comments:</strong></td><td colspan="3"></td></tr>
</table>
<p style="font-size:11px;color:#666;margin-top:8px">Retain all completed worksheets for 5 years. These are the primary evidence of daily safeguarding compliance for BoC examinations and annual report attestation.</p>
  $tpl7$
);

-- ---------------------------------------------------------------
-- Template 8 — ORM & Incident Log
-- ---------------------------------------------------------------
INSERT INTO public.document_templates (name, description, category, version, sort_order, content_html)
VALUES (
  'ORM & Incident Log',
  'Operational risk and incident register: classifies each incident, tracks 24h/72h BoC notification status, root cause, remediation, and post-incident review date.',
  'compliance', '1.0', 80,
  $tpl8$
<h1 style="margin-bottom:4px">ORM &amp; Incident Log</h1>
<p style="color:#666;font-size:13px;margin-top:0">RPAA requirement. Log every Level 1, 2, and 3 operational incident. Level 3 incidents trigger mandatory Bank of Canada notifications: initial within 24 hours, detailed within 72 hours of becoming aware.</p>

<table style="margin-bottom:16px">
  <tr><td style="width:120px"><strong>Year:</strong></td><td></td><td style="width:120px"><strong>Entity name:</strong></td><td></td></tr>
  <tr><td><strong>ORM Owner:</strong></td><td></td><td><strong>Last reviewed:</strong></td><td></td></tr>
</table>

<h2>Classification Guide</h2>
<table style="margin-bottom:16px;font-size:12px">
  <tr><th>Level</th><th>Description</th><th>BoC Notification?</th></tr>
  <tr><td><strong>Level 1 — Minor</strong></td><td>Service degradation &lt;2 hours; no impact on end-user funds; no data exposure.</td><td>No — internal response only.</td></tr>
  <tr><td><strong>Level 2 — Significant</strong></td><td>Disruption 2–24 hours; any risk to end-user funds; data exposure without exfiltration.</td><td>Compliance Officer assesses — notify BoC if criteria met.</td></tr>
  <tr><td><strong>Level 3 — Notifiable</strong></td><td>Material impairment of payment activities; fund loss or risk; cybersecurity breach with exfiltration.</td><td><strong>Mandatory</strong> — 24h initial + 72h detailed notification in PSPConnect.</td></tr>
</table>

<h2>Incident Register</h2>
<table style="font-size:11px">
  <tr>
    <th style="width:50px">ID</th>
    <th style="width:70px">Date / Time Detected</th>
    <th style="width:80px">Category<br/>(Tech / People / Process / External)</th>
    <th style="width:130px">Description</th>
    <th style="width:55px">Level<br/>(1/2/3)</th>
    <th style="width:75px">24h Initial Notification Sent?<br/>Date / Time</th>
    <th style="width:75px">72h Detailed Notification Sent?<br/>Date / Time</th>
    <th style="width:75px">BoC PSPConnect Ref #</th>
    <th style="width:100px">Root Cause</th>
    <th style="width:80px">Remediation Status &amp; Owner</th>
    <th style="width:70px">PIR Date<br/>(Level 2+)</th>
    <th style="width:50px">Closed</th>
  </tr>
  <tr><td></td><td></td><td></td><td style="height:40px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td></td><td></td><td></td><td style="height:40px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td></td><td></td><td></td><td style="height:40px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td></td><td></td><td></td><td style="height:40px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><td></td><td></td><td></td><td style="height:40px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
</table>

<h2>Post-Incident Review (PIR) Log</h2>
<p style="font-size:12px;color:#555">Complete a PIR for every Level 2 and Level 3 incident. Report to senior management. BoC may request the PIR for notifiable incidents.</p>
<table style="margin-bottom:16px">
  <tr><th style="width:60px">Incident ID</th><th style="width:80px">PIR Date</th><th style="width:100px">Reviewer</th><th>Was BoC notification timely?</th><th>Root Cause Confirmed?</th><th>Key Lessons Learned</th><th style="width:120px">Action Items &amp; Owners</th></tr>
  <tr><td></td><td></td><td></td><td>&#9744; Yes &nbsp;&#9744; No</td><td>&#9744; Yes &nbsp;&#9744; No</td><td style="height:50px"></td><td></td></tr>
  <tr><td></td><td></td><td></td><td>&#9744; Yes &nbsp;&#9744; No</td><td>&#9744; Yes &nbsp;&#9744; No</td><td style="height:50px"></td><td></td></tr>
</table>

<h2>Annual ORM Summary</h2>
<table style="margin-bottom:16px">
  <tr><td style="width:280px"><strong>Total incidents logged this year:</strong></td><td></td></tr>
  <tr><td><strong>Level 1 (minor):</strong></td><td></td></tr>
  <tr><td><strong>Level 2 (significant):</strong></td><td></td></tr>
  <tr><td><strong>Level 3 (notifiable to BoC):</strong></td><td></td></tr>
  <tr><td><strong>PIRs completed:</strong></td><td></td></tr>
  <tr><td><strong>Open remediation actions:</strong></td><td></td></tr>
  <tr><td><strong>Notable systemic risk trends identified:</strong></td><td></td></tr>
</table>

<table>
  <tr><td style="width:220px"><strong>ORM Owner signature:</strong></td><td></td><td style="width:100px"><strong>Date:</strong></td><td></td></tr>
  <tr><td><strong>Senior Management reviewed:</strong></td><td></td><td><strong>Date:</strong></td><td></td></tr>
</table>
<p style="font-size:11px;color:#666;margin-top:8px">Retain this log for 5 years. Keep all PIR reports and BoC notification confirmation records in the compliance file.</p>
  $tpl8$
);
