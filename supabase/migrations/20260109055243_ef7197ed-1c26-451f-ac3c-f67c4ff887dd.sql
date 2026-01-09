-- Add policies for customer self-service portal access

-- Customers can view their own onboarding progress
CREATE POLICY "Customers can view own onboarding"
ON public.customer_onboarding FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.customer_portal_access cpa
    WHERE cpa.customer_id = customer_onboarding.customer_id
    AND cpa.user_id = auth.uid()
    AND cpa.is_active = true
  )
);

-- Customers can update their own onboarding steps
CREATE POLICY "Customers can update own onboarding"
ON public.customer_onboarding FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.customer_portal_access cpa
    WHERE cpa.customer_id = customer_onboarding.customer_id
    AND cpa.user_id = auth.uid()
    AND cpa.is_active = true
  )
);

-- Customers can view their own documents
CREATE POLICY "Customers can view own documents"
ON public.customer_documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.customer_portal_access cpa
    WHERE cpa.customer_id = customer_documents.customer_id
    AND cpa.user_id = auth.uid()
    AND cpa.is_active = true
  )
);

-- Customers can upload their own documents
CREATE POLICY "Customers can upload own documents"
ON public.customer_documents FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.customer_portal_access cpa
    WHERE cpa.customer_id = customer_documents.customer_id
    AND cpa.user_id = auth.uid()
    AND cpa.is_active = true
  )
);

-- Customers can view their linked customer record
CREATE POLICY "Customers can view own customer record"
ON public.customers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.customer_portal_access cpa
    WHERE cpa.customer_id = customers.id
    AND cpa.user_id = auth.uid()
    AND cpa.is_active = true
  )
);

-- Customers can update their own customer record during onboarding
CREATE POLICY "Customers can update own customer record"
ON public.customers FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.customer_portal_access cpa
    WHERE cpa.customer_id = customers.id
    AND cpa.user_id = auth.uid()
    AND cpa.is_active = true
  )
);

-- Storage: Customers can view their own documents
CREATE POLICY "Customers can view own storage documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'customer-documents' AND
  EXISTS (
    SELECT 1 FROM public.customer_portal_access cpa
    WHERE cpa.user_id = auth.uid()
    AND cpa.is_active = true
    AND (storage.foldername(name))[1] = cpa.customer_id::text
  )
);

-- Storage: Customers can upload their own documents
CREATE POLICY "Customers can upload own storage documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'customer-documents' AND
  EXISTS (
    SELECT 1 FROM public.customer_portal_access cpa
    WHERE cpa.user_id = auth.uid()
    AND cpa.is_active = true
    AND (storage.foldername(name))[1] = cpa.customer_id::text
  )
);