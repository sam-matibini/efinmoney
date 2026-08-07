# Mandatory vs Elective Training Strategy

Goal: agree which courses every staff member must take (and how often), and which are role-based or optional, so the compliance matrix reflects a defensible FINTRAC/RPAA training program.

## What the catalogue currently says

From the training migrations, courses are classified by `program_area` with an `is_mandatory` flag and `frequency_months`:

- `fintrac_mandatory`: AML/ATF Fundamentals, Suspicious Transaction Reporting
- `fintrac_elective`: Sanctions & Screening, Privacy & PIPEDA, Fraud & Security Awareness, AML Course, Compliance Course
- `boc_rpaa_mandatory`: RPAA Compliance Gap Analysis, Bank of Canada Registration & Reporting, RPAA Role-Based Employee Training, RPAA Policies & Procedures, AML & Transaction Monitoring Controls, Vendor Management & Data Security, Financial Crime & Safeguarding Audits
- `fintrac_elective` (phase 5): Advanced ML/TF Typologies for Remittances, Sanctions Compliance & Terrorist Property Reporting, Compliance Culture & Ethics, Fraud Awareness & Internal Controls, Privacy, PIPEDA & Data Stewardship — all `is_mandatory = false`, 24 months
- `boc_rpaa_elective`: PSP Annual Reporting & Ongoing Disclosure Obligations, Consumer-Driven Banking & Evolving Payments Regulation — false, 24 months
- `consulting`: 10 advisory courses (program design, examination prep, MSB/PSP registration advisory) — false, 12 months

The gap: "mandatory" today is all-or-nothing per course. A teller and the Chief Compliance Officer get the same list, and several courses that a regulator would expect of everyone (sanctions, privacy, fraud) sit as electives.

## Recommended three-tier model

**Tier 1 — Mandatory for all staff (annual, 12 months)**
Every person in `admin_users`, no exceptions, including contractors and directors.

1. AML/ATF Fundamentals — 12 mo
2. Suspicious Transaction Reporting — 12 mo
3. Sanctions Compliance & Terrorist Property Reporting — 12 mo (promote from elective; sanctions screening is a live daily control)
4. Fraud Awareness & Internal Controls — 12 mo
5. Privacy, PIPEDA & Data Stewardship — 24 mo
6. Compliance Culture & Ethics — 24 mo

Rationale: FINTRAC expects everyone who handles transactions, customer data, or reporting to receive ongoing training; the annual cycle matches the compliance program's effectiveness review.

**Tier 2 — Mandatory by role (auto-assigned from the staff member's role)**
Applies automatically, not chosen by the learner.

- Compliance / super admin: RPAA Policies & Procedures, AML & Transaction Monitoring Controls, Financial Crime & Safeguarding Audits, RPAA Role-Based Employee Training, Advanced ML/TF Typologies for Remittances — 12 mo
- Finance / treasury: Safeguarding Program Design (RPAA), RPAA Compliance Gap Analysis, PSP Annual Reporting & Ongoing Disclosure Obligations — 12 mo
- Operations / support: Advanced ML/TF Typologies for Remittances, Vendor Management & Data Security — 12 mo
- Engineering / technology: Vendor Management & Data Security, ORM & Incident Response Program Design — 24 mo
- Senior management / directors: Bank of Canada Registration & Reporting, Compliance Culture & Ethics, RPAA Compliance Gap Analysis — 24 mo

**Tier 3 — Elective (self-enrol, tracked but never overdue)**
All 10 consulting courses (program design, examination prep, MSB/PSP registration advisory), Consumer-Driven Banking & Evolving Payments Regulation, and duplicates like "AML Course" / "Compliance Course" (recommend retiring these two — they overlap with AML/ATF Fundamentals and Compliance Culture & Ethics).

**Onboarding rule:** Tier 1 must be completed within 30 days of a staff member becoming `active`; Tier 2 within 60 days. Recurrence then runs off the completion date and the course's own `frequency_months`.

## How this shows up in the app

- Course editor gets a Requirement selector: All staff / By role / Elective, plus a role multi-select when "By role" is chosen (stored in the existing `role_requirement` / `applies_to_roles` fields).
- Learner tab splits into "Required for you" (Tier 1 + Tier 2 matched to their role) and "Optional catalogue".
- Compliance matrix counts only courses actually required for that person, so an engineer isn't shown overdue on a safeguarding course.
- Status per course per person: Complete / Due in 30 days / Overdue / Not started, driven by completion date + `frequency_months`.
- New-hire clocks (30/60 days) drive an "Onboarding overdue" state distinct from "Recertification overdue".

## Technical notes

Because the database is your own Supabase, schema and seed changes are delivered as a single idempotent SQL script for your SQL Editor — I will not run migrations. It would cover: a `requirement_type` column (`all_staff` | `role_based` | `elective`), `applies_to_roles text[]`, `onboarding_due_days`, and UPDATE statements applying the tier assignments above. App changes (course editor, learner split, matrix logic) I make directly.

## Order of work

1. You confirm or adjust the tier assignments above.
2. SQL script for `requirement_type` / `applies_to_roles` + tier updates.
3. Course editor requirement controls.
4. Learner "Required for you" split.
5. Role-aware compliance matrix and onboarding due dates.
