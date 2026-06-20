import { useEffect, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";

const MIN_DURATION_MS = 600;
const MAX_DURATION_MS = 2000;

const SplashScreen = () => {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const start = performance.now();

    // Remove the static HTML splash now that React has mounted.
    const staticSplash = document.getElementById("initial-splash");
    if (staticSplash) {
      staticSplash.classList.add("is-hiding");
      window.setTimeout(() => staticSplash.remove(), 400);
    }

    const hide = () => {
      const elapsed = performance.now() - start;
      const wait = Math.max(0, MIN_DURATION_MS - elapsed);
      window.setTimeout(() => {
        setFading(true);
        window.setTimeout(() => setVisible(false), 300);
      }, wait);
    };

    // React has mounted — hide right after the minimum brand window,
    // and enforce a hard maximum so we never trap the user on the spinner.
    const raf = requestAnimationFrame(hide);
    const hardStop = window.setTimeout(hide, MAX_DURATION_MS);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(hardStop);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#07122e",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fading ? 0 : 1,
        transition: "opacity 300ms ease-out",
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <LoadingSpinner size={140} />
    </div>
  );
};

export default SplashScreen;
