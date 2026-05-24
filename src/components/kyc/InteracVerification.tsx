import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface Props {
  className?: string;
  label?: string;
}

export const InteracVerification = ({ className, label = "Verify with Interac" }: Props) => {
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("interac-start", { body: {} });
      if (error || !data?.authorization_url) {
        throw new Error(error?.message || data?.error || "Could not start Interac verification");
      }
      window.location.href = data.authorization_url;
    } catch (err) {
      setLoading(false);
      console.error(err);
      toast.error((err as Error).message || "Could not start verification");
    }
  };

  return (
    <Button size="lg" className={className} onClick={start} disabled={loading} variant="outline">
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
      {loading ? "Redirecting…" : label}
    </Button>
  );
};

export default InteracVerification;
