import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import LogoLoader from "@/components/ui/LogoLoader";
import { motion, AnimatePresence } from "framer-motion";

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
      const url = data.authorization_url as string;
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.href = url;
        } else {
          window.location.href = url;
        }
      } catch {
        window.open(url, "_blank", "noopener");
      }
    } catch (err) {
      setLoading(false);
      console.error(err);
      toast.error((err as Error).message || "Could not start verification");
    }
  };

  return (
    <div className={className}>
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div
            key="loader"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25 }}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 py-5 px-3"
          >
            <LogoLoader
              size="md"
              label="Connecting to Interac"
              subLabel="You'll be redirected to your bank to verify securely."
              slowAfterMs={6000}
            />
          </motion.div>
        ) : (
          <motion.div
            key="cta"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Button size="lg" className="w-full" onClick={start} variant="outline">
              <ShieldCheck className="w-4 h-4 mr-2" />
              {label}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default InteracVerification;
