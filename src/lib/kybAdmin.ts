import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (t: string) => any };

export type KybMessage = {
  id: string;
  business_profile_id: string;
  author_user_id: string;
  author_role: "admin" | "applicant";
  body: string;
  created_at: string;
};

export async function kybAudit(
  businessProfileId: string,
  action: string,
  notes?: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await db.from("business_kyb_audit_log").insert({
    business_profile_id: businessProfileId,
    admin_id: user.id,
    action,
    notes: notes ?? null,
  });
  if (error) throw error;
}

export async function postKybMessage(
  businessProfileId: string,
  body: string,
  authorRole: "admin" | "applicant",
): Promise<KybMessage> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Message is empty.");
  const { data, error } = await db
    .from("business_kyb_messages")
    .insert({
      business_profile_id: businessProfileId,
      author_user_id: user.id,
      author_role: authorRole,
      body: trimmed,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as KybMessage;
}

export async function listKybMessages(businessProfileId: string): Promise<KybMessage[]> {
  const { data, error } = await db
    .from("business_kyb_messages")
    .select("*")
    .eq("business_profile_id", businessProfileId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as KybMessage[];
}
