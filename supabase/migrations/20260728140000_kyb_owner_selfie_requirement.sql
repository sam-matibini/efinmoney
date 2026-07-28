-- Selfie / liveness KYC for corporate onboarding.
-- Each declared owner (UBO / director / signing officer) must submit a live
-- selfie, captured in-app via the camera. It reuses the business_documents
-- pipeline: a required owner-level requirement row makes it part of the
-- missing-docs gating and admin review with no schema change.

INSERT INTO public.kyb_document_requirements
  (country, entity_type, document_type, label, description, is_required, applies_to, sort_order)
VALUES
  ('CA', NULL, 'owner_selfie', 'Selfie / Liveness Check',
   'A live photo of the individual''s face, taken with your camera, to confirm their identity. Use a well-lit area and remove hats or glasses.',
   true, 'owner', 40),
  ('NG', NULL, 'owner_selfie', 'Selfie / Liveness Check',
   'A live photo of the individual''s face, taken with your camera, to confirm their identity. Use a well-lit area and remove hats or glasses.',
   true, 'owner', 40)
ON CONFLICT (country, entity_type, document_type, applies_to) DO NOTHING;
