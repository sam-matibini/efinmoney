import { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

const AdyenReturnHandler = lazy(() => import("@/components/payments/AdyenReturnHandler"));
const AliceWidget = lazy(() => import("@/components/alice/AliceWidget"));

export function ShellAdyenHandler() {
  const [searchParams] = useSearchParams();
  const needsAdyen =
    searchParams.has("sessionId") && searchParams.has("redirectResult");

  if (!needsAdyen) return null;

  return (
    <Suspense fallback={null}>
      <AdyenReturnHandler />
    </Suspense>
  );
}

export function DeferredAliceWidget({ context }: { context: "user" | "admin" }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (import.meta.env.VITE_ALICE_ENABLED === "false") return;
    const run = () => setShow(true);
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(run, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const timer = setTimeout(run, 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <Suspense fallback={null}>
      <AliceWidget context={context} />
    </Suspense>
  );
}
