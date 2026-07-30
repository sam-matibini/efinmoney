import { ReactNode, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AtSign, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";

const TAG_REGEX = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

const EfinTagGuard = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { isAdmin, isFinance, isCompliance } = useUserRoles();
  const queryClient = useQueryClient();
  const [tag, setTag] = useState("");

  const isStaff = isAdmin || isFinance || isCompliance;

  const trimmed = tag.trim().replace(/^@/, "");
  const isValid = TAG_REGEX.test(trimmed);

  const needsTag =
    !!user &&
    !profileLoading &&
    !!profile &&
    profile.efin_tag == null &&
    !isStaff;

  const save = useMutation({
    mutationFn: async (cleanTag: string) => {
      if (!user) throw new Error("Not signed in.");
      const { error } = await supabase
        .from("profiles")
        .update({ efin_tag: cleanTag })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Your eFin tag is set.");
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
    onError: (e: Error & { code?: string }) => {
      if (e?.code === "23505") {
        toast.error("That tag is taken. Try another.");
      } else {
        toast.error(e?.message || "Could not save your tag.");
      }
    },
  });

  useEffect(() => {
    if (!needsTag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [needsTag]);

  const reason = useMemo(() => {
    if (!isValid && trimmed.length > 0) {
      if (trimmed.length < 3) return "Tag is too short — 3 characters minimum.";
      if (trimmed.length > 20) return "Tag is too long — 20 characters maximum.";
      if (!/^[A-Za-z]/.test(trimmed)) return "Start with a letter.";
      return "Letters, numbers, and underscores only.";
    }
    return null;
  }, [isValid, trimmed]);

  if (!needsTag) return <>{children}</>;

  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm pointer-events-none"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="efin-tag-guard-title"
        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      >
        <Card className="w-full max-w-md shadow-2xl border-primary/20">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <AtSign className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2
                  id="efin-tag-guard-title"
                  className="font-display text-lg font-bold tracking-tight"
                >
                  Create your eFin tag
                </h2>
                <p className="text-xs text-muted-foreground">
                  One quick step before you continue.
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Your eFin tag is your unique handle. Other eFinMoney users can send you money
              instantly with <span className="font-mono text-foreground">@yourname</span>. You can
              change it later in Profile → Settings.
            </p>

            <div className="space-y-2">
              <Label htmlFor="efinTagGuard">eFin tag</Label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="efinTagGuard"
                  autoFocus
                  value={tag}
                  onChange={(e) =>
                    setTag(e.target.value.replace(/\s/g, "").replace(/^@/, ""))
                  }
                  placeholder="yourname"
                  maxLength={20}
                  disabled={save.isPending}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span
                  className={
                    reason
                      ? "text-destructive"
                      : isValid
                        ? "text-emerald-600"
                        : "text-muted-foreground"
                  }
                >
                  {reason || (isValid ? "Looks good." : "3–20 chars · letters, numbers, _ · start with a letter.")}
                </span>
                <span className="text-muted-foreground tabular-nums">{trimmed.length}/20</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Case-insensitive — your tag is unique across all eFinMoney users.</span>
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={!isValid || save.isPending}
              onClick={() => save.mutate(trimmed)}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {save.isPending ? "Saving…" : "Save and continue"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default EfinTagGuard;
