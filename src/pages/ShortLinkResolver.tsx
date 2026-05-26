import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Loader2, AlertTriangle } from "lucide-react";

const ShortLinkResolver = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError("Missing link code");
      return;
    }
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.rpc("resolve_short_link", { p_code: code });
      if (cancelled) return;

      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setError("This link is no longer available.");
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      const targetPath: string = row.target_path;
      const params: Record<string, string> = (row.params ?? {}) as Record<string, string>;

      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      ).toString();

      const dest = qs ? `${targetPath}?${qs}` : targetPath;
      navigate(dest, { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [code, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <h1 className="text-lg font-semibold">Link unavailable</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link
            to="/"
            className="inline-block text-sm font-medium text-primary hover:underline"
          >
            Go to homepage
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Logo className="w-10 h-10" />
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Opening link…</span>
      </div>
    </div>
  );
};

export default ShortLinkResolver;
