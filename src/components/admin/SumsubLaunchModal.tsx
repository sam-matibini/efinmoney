import { useEffect, useState } from "react";
import SumsubWebSdk from "@sumsub/websdk-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import LoadingSpinner from "@/components/LoadingSpinner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  onCompleted?: () => void;
}

export default function SumsubLaunchModal({ open, onOpenChange, userId, onCompleted }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [levelName, setLevelName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setToken(null);
      setLevelName(null);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("sumsub-create-applicant", {
          body: { user_id: userId },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message);
        setToken(data.access_token);
        setLevelName(data.level_name);
      } catch (e) {
        toast.error("Failed to launch Sumsub: " + (e as Error).message);
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, userId, onOpenChange]);

  const refreshToken = async (): Promise<string> => {
    const { data, error } = await supabase.functions.invoke("sumsub-refresh-token", {
      body: { user_id: userId, level_name: levelName },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data.access_token;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sumsub Enhanced Due Diligence</DialogTitle>
        </DialogHeader>
        {loading || !token ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <LoadingSpinner size={20} className="mr-2" /> Initialising Sumsub…
          </div>
        ) : (
          <SumsubWebSdk
            accessToken={token}
            expirationHandler={refreshToken}
            config={{ lang: "en" }}
            options={{ addViewportTag: false, adaptIframeHeight: true }}
            onMessage={(type: string) => {
              if (type === "idCheck.applicantReviewComplete" || type === "idCheck.onApplicantSubmitted") {
                onCompleted?.();
              }
            }}
            onError={(e: unknown) => {
              console.error("Sumsub error", e);
              toast.error("Sumsub error");
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
