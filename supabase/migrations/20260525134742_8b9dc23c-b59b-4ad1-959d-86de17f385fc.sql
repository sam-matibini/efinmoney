
-- 1. cards: drop plaintext PAN/CVV columns (PCI violation)
ALTER TABLE public.cards DROP COLUMN IF EXISTS card_number;
ALTER TABLE public.cards DROP COLUMN IF EXISTS cvv;

-- 2. kyc_verifications: restrict client UPDATE to safe submission fields only.
-- Drop the broad self-update policy, replace with column-level GRANT.
DROP POLICY IF EXISTS "Users update own kyc" ON public.kyc_verifications;

CREATE POLICY "Users update own kyc submission fields"
ON public.kyc_verifications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Revoke broad UPDATE then grant only safe columns to authenticated.
REVOKE UPDATE ON public.kyc_verifications FROM authenticated;
GRANT UPDATE (
  current_step,
  id_document_type,
  id_document_url,
  id_document_country,
  address_document_type,
  address_document_url,
  selfie_url,
  persona_inquiry_id,
  persona_session_token,
  interac_session_id
) ON public.kyc_verifications TO authenticated;

-- Reviewers / admins use is_kyc_reviewer policy with full table privileges via service role / definer triggers.
-- Ensure service_role keeps full access (it bypasses RLS but make grants explicit).
GRANT UPDATE ON public.kyc_verifications TO service_role;

-- 3. user_risk_tiers: remove user-facing INSERT/UPDATE policies.
DROP POLICY IF EXISTS "Users insert own risk tier" ON public.user_risk_tiers;
DROP POLICY IF EXISTS "Users update own risk tier" ON public.user_risk_tiers;

-- Keep SELECT for owner + admin.
-- Admin-only INSERT/UPDATE.
CREATE POLICY "Admins manage risk tiers insert"
ON public.user_risk_tiers
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'finance'::app_role)
);

CREATE POLICY "Admins manage risk tiers update"
ON public.user_risk_tiers
FOR UPDATE
TO authenticated
USING (
  public.is_admin_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'finance'::app_role)
)
WITH CHECK (
  public.is_admin_user(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'finance'::app_role)
);

-- 4. transfers: hide interac_security_answer from clients via column-level revoke.
REVOKE SELECT (interac_security_answer) ON public.transfers FROM authenticated;
-- Backend (service role) still reads it via service-role bypass / explicit grant.
GRANT SELECT (interac_security_answer) ON public.transfers TO service_role;
