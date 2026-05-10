import { useState } from "react";
import Persona from "persona";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
  onComplete?: (info: { inquiryId: string; status: string }) => void;
  onError?: (err: unknown) => void;
  className?: string;
  label?: string;
}

export const PersonaVerification = ({ userId, onComplete, onError, className, label = "Start ID Verification" }: Props) => {
  const [loading, setLoading] = useState(false);

  const startVerification = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-persona-inquiry", {
        body: { userId },
      });
      if (error || !data?.sessionToken) {
        throw new Error(error?.message || data?.error || "Failed to initialize verification");
      }

      const client = new (Persona as any).Client({
        templateId: data.templateId,
        environment: data.environment || "sandbox",
        sessionToken: data.sessionToken,
        onReady: () => {
          setLoading(false);
          client.open();
        },
        onComplete: ({ inquiryId, status }: { inquiryId: string; status: string }) => {
          toast.success("Identity check submitted");
          onComplete?.({ inquiryId, status });
        },
        onCancel: () => {
          setLoading(false);
        },
        onError: (e: unknown) => {
          setLoading(false);
          console.error("Persona error", e);
          toast.error("Verification was interrupted. Please try again.");
          onError?.(e);
        },
      });
    } catch (err) {
      setLoading(false);
      console.error(err);
      toast.error((err as Error).message || "Could not start verification");
      onError?.(err);
    }
  };

  return (
    <Button size="lg" className={className} onClick={startVerification} disabled={loading}>
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
      {loading ? "Initializing…" : label}
    </Button>
  );
};

export default PersonaVerification;
