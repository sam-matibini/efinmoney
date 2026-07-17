import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, LogOut, LayoutDashboard } from "lucide-react";

interface Props {
  onSaveDraft?: () => Promise<void> | void;
  className?: string;
}

const SaveAndExitButton = ({ onSaveDraft, className }: Props) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"dashboard" | "signout" | null>(null);

  const save = async () => {
    if (onSaveDraft) {
      try {
        await onSaveDraft();
      } catch (e) {
        // Non-blocking — we still let the user exit.
        console.error("Save draft failed", e);
      }
    }
  };

  const goDashboard = async () => {
    setBusy("dashboard");
    await save();
    toast.success("Progress saved. Resume anytime from your dashboard.");
    setBusy(null);
    setOpen(false);
    navigate("/dashboard");
  };

  const signOut = async () => {
    setBusy("signout");
    await save();
    await supabase.auth.signOut();
    toast.success("Progress saved. Sign back in to continue.");
    setBusy(null);
    setOpen(false);
    navigate("/auth");
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={
          "group rounded-full border-primary/20 bg-primary/5 px-4 py-2 text-xs font-medium text-foreground/80 shadow-sm backdrop-blur transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-foreground hover:shadow-md " +
          (className ?? "")
        }
        onClick={() => setOpen(true)}
      >
        <Save className="w-3.5 h-3.5 mr-2 text-primary transition-transform group-hover:-translate-y-0.5" />
        Save & continue later
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save your progress?</AlertDialogTitle>
            <AlertDialogDescription>
              Don't have everything ready? No problem — we'll save what you've
              entered so far. You can pick up right where you left off whenever
              you're ready.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button
              onClick={goDashboard}
              disabled={busy !== null}
              className="w-full"
            >
              <LayoutDashboard className="w-4 h-4 mr-2" />
              {busy === "dashboard" ? "Saving..." : "Save & go to dashboard"}
            </Button>
            <Button
              onClick={signOut}
              disabled={busy !== null}
              variant="outline"
              className="w-full"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {busy === "signout" ? "Saving..." : "Save & sign out"}
            </Button>
            <AlertDialogCancel className="w-full mt-0">
              Keep going
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default SaveAndExitButton;
