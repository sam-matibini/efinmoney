## Switch Persona to production

Production keys are already set in secrets (`PERSONA_API_KEY`, `PERSONA_TEMPLATE_ID`, `PERSONA_WEBHOOK_SECRET`, `PERSONA_ENVIRONMENT=production`). The runtime code currently still falls back to `"sandbox"` if the env value is ever missing, which is risky now that we're live.

### Changes

1. `supabase/functions/create-persona-inquiry/index.ts`
   - Change `Deno.env.get("PERSONA_ENVIRONMENT") || "sandbox"` to default to `"production"`.

2. `src/components/kyc/PersonaVerification.tsx`
   - Change the client `environment: data.environment || "sandbox"` fallback to `"production"`.

No schema, RLS, or business-logic changes. Webhook handler already reads `PERSONA_WEBHOOK_SECRET` directly and needs no edit.
