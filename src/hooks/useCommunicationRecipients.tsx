import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CommunicationRecipient {
  key: string;
  label: string;
  email: string | null;
  source: "user" | "customer";
  user_id: string | null;
  customer_id: string | null;
}

/** Everyone staff can message: app users (profiles) plus CRM customers. */
export const useCommunicationRecipients = () =>
  useQuery({
    queryKey: ["communication-recipients"],
    queryFn: async (): Promise<CommunicationRecipient[]> => {
      const [profiles, customers] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .order("full_name", { nullsFirst: false })
          .limit(500),
        supabase.from("customers").select("id, name, email").order("name").limit(500),
      ]);
      if (profiles.error) throw profiles.error;
      if (customers.error) throw customers.error;

      const list: CommunicationRecipient[] = [];
      for (const p of profiles.data || []) {
        list.push({
          key: `user:${p.user_id}`,
          label: p.full_name || p.email || "Unnamed user",
          email: p.email,
          source: "user",
          user_id: p.user_id,
          customer_id: null,
        });
      }
      for (const c of customers.data || []) {
        list.push({
          key: `customer:${c.id}`,
          label: c.name || c.email || "Unnamed customer",
          email: c.email,
          source: "customer",
          user_id: null,
          customer_id: c.id,
        });
      }
      return list;
    },
    staleTime: 5 * 60_000,
  });
