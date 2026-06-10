import { useEffect, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";

const MIN_DURATION_MS = 1200;

const SplashScreen = () => {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const start = performance.now();
    const hide = () => {
      const elapsed = performance.now() - start;
      const wait = Math.max(0, MIN_DURATION_MS - elapsed);
      window.setTimeout(() => {
        setFading(true);
        window.setTimeout(() => setVisible(false), 350);
      }, wait);
    };

    if (document.readyState === "complete") {
      hide();
    } else {
      window.addEventListener("load", hide, { once: true });
      // Safety fallback in case `load` never fires
      const fallback = window.setTimeout(hide, 3000);
      return () => {
        window.removeEventListener("load", hide);
        window.clearTimeout(fallback);
      };
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "hsl(var(--background))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fading ? 0 : 1,
        transition: "opacity 350ms ease-out",
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <LoadingSpinner size={140} />
    </div>
  );
};

export default SplashScreen;
