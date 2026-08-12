import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "@/components/LoadingSpinner";

/**
 * OAuth return landing for Plaid (Canadian banks).
 * Persist the full return URL so Link can resume with receivedRedirectUri,
 * then send the user back to Send / Top-up.
 */
export default function PlaidOAuthReturnPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const href = window.location.href;
    if (href.includes("oauth_state_id=")) {
      try {
        sessionStorage.setItem("plaid_oauth_return", href);
      } catch {
        /* ignore */
      }
    }
    const returnTo = sessionStorage.getItem("plaid_oauth_continue") || "/send";
    sessionStorage.removeItem("plaid_oauth_continue");
    navigate(returnTo, { replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <LoadingSpinner size={18} />
      Returning from your bank…
    </div>
  );
}
