import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DocumentUploader from "@/components/kyc/DocumentUploader";
import LoadingSpinner from "@/components/LoadingSpinner";
import { RoleBadge } from "@/components/admin-portal/Badges";
import { Clock, CheckCircle2, LogOut } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";

const ID_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "drivers_license", label: "Driver's license" },
  { value: "national_id", label: "National ID" },
];

const StaffOnboardingPage = () => {
  const { user, admin, loading, signOut } = useAdminAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [idType, setIdType] = useState("passport");
  const [docPath, setDocPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <AdminLayout>
        <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size={64} />
      </div>
    );
  }

  // Active staff don't need onboarding.
  if (admin && admin.status === "active") {
    navigate("/admin/dashboard", { replace: true });
    return null;
  }

  const pendingReview = admin?.status === "pending_review";

  const uploadDoc = async (file: File) => {
    if (!user) throw new Error("Not authenticated");
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${user.id}/id-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("staff-documents").upload(path, file, { upsert: true });
    if (error) throw error;
    setDocPath(path);
  };

  const canSubmit = !!phone.trim() && !!position.trim() && !!docPath && (admin?.status !== "invited" || password.length >= 8);

  const submit = async () => {
    if (!user || !admin) return;
    setSubmitting(true);
    try {
      // First-time invited staff set their password.
      if (admin.status === "invited" && password) {
        const { error: pwErr } = await supabase.auth.updateUser({ password });
        if (pwErr) throw pwErr;
      }

      const { error } = await supabase
        .from("admin_users")
        .update({
          phone: phone.trim(),
          position: position.trim(),
          department: department.trim() || null,
          id_document_type: idType,
          id_document_url: docPath,
          status: "pending_review",
        })
        .eq("id", user.id);
      if (error) throw error;

      toast.success("Submitted for review");
      // Reload so the auth context picks up the new status and shows the pending view.
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingReview) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className="text-xl font-display font-semibold">Application under review</h1>
            <p className="text-sm text-muted-foreground">
              Thanks{admin?.full_name ? `, ${admin.full_name}` : ""}. Your details and ID document have been submitted.
              A super administrator will review and activate your access shortly.
            </p>
            <Button variant="outline" onClick={() => signOut()} className="gap-2">
              <LogOut className="w-4 h-4" /> Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-display font-bold">Welcome to eFinMoney</h1>
          <p className="text-sm text-muted-foreground">
            Complete your staff profile to request access.
          </p>
          {admin && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="text-muted-foreground">Assigned role:</span> <RoleBadge role={admin.role} />
            </div>
          )}
        </div>

        {admin?.status === "invited" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Set a password</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <Label htmlFor="pw">Password</Label>
                <Input
                  id="pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
                {password.length > 0 && password.length < 8 && (
                  <p className="text-xs text-destructive">Password must be at least 8 characters.</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Your details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="position">Position</Label>
                <Input id="position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Compliance Analyst" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="department">Department</Label>
                <Input id="department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Compliance" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Identity verification</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Document type</Label>
              <Select value={idType} onValueChange={setIdType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ID_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DocumentUploader
              label="Upload your ID document"
              uploadedPath={docPath}
              onUpload={uploadDoc}
              onRemove={() => setDocPath(null)}
            />
            {docPath && (
              <p className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> Document uploaded
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => signOut()} className="gap-2">
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
          <Button onClick={submit} disabled={!canSubmit || submitting} className="gap-2">
            {submitting && <LoadingSpinner size={16} />} Submit for review
          </Button>
        </div>
      </div>
    </div>
    </AdminLayout>
  );
};

export default StaffOnboardingPage;
