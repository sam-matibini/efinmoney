-- Alice AI assistant: per-user conversation history (user + admin contexts).
-- RLS-scoped so each person only sees their own chats. Explicit GRANTs to
-- authenticated (see project_missing_table_grants — RLS without a grant yields 42501).

CREATE TABLE IF NOT EXISTS public.alice_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context text NOT NULL DEFAULT 'user' CHECK (context IN ('user', 'admin')),
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.alice_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.alice_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL DEFAULT '',
  tool_calls jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alice_conversations_user ON public.alice_conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_alice_messages_conversation ON public.alice_messages (conversation_id, created_at);

ALTER TABLE public.alice_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alice_messages ENABLE ROW LEVEL SECURITY;

-- Conversations: owner-only CRUD.
DROP POLICY IF EXISTS "Alice conversations are owner-only" ON public.alice_conversations;
CREATE POLICY "Alice conversations are owner-only" ON public.alice_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Messages: accessible only when the parent conversation belongs to the caller.
DROP POLICY IF EXISTS "Alice messages follow conversation ownership" ON public.alice_messages;
CREATE POLICY "Alice messages follow conversation ownership" ON public.alice_messages FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.alice_conversations c
    WHERE c.id = alice_messages.conversation_id AND c.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.alice_conversations c
    WHERE c.id = alice_messages.conversation_id AND c.user_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alice_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alice_messages TO authenticated;
GRANT ALL ON public.alice_conversations TO service_role;
GRANT ALL ON public.alice_messages TO service_role;
