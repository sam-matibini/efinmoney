import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface LoadingSpinnerProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

// Module-level cache so we only sign the URL once per session.
let cachedUrl: string | null = null;
let inflight: Promise<string | null> | null = null;

const getSpinnerUrl = (): Promise<string | null> => {
  if (cachedUrl) return Promise.resolve(cachedUrl);
  if (inflight) return inflight;
  inflight = supabase.storage
    .from("assets")
    .createSignedUrl("spinner.webm", 60 * 60 * 24)
    .then(({ data, error }) => {
      inflight = null;
      if (error || !data?.signedUrl) return null;
      cachedUrl = data.signedUrl;
      return cachedUrl;
    })
    .catch(() => {
      inflight = null;
      return null;
    });
  return inflight;
};

const LoadingSpinner = ({ size = 120, className, style }: LoadingSpinnerProps) => {
  const [src, setSrc] = useState<string | null>(cachedUrl);

  useEffect(() => {
    if (src) return;
    let cancelled = false;
    getSpinnerUrl().then((url) => {
      if (!cancelled && url) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        ...style,
      }}
    >
      {src && (
        <video
          src={src}
          autoPlay
          loop
          muted
          playsInline
          width={size}
          height={size}
          style={{ width: size, height: size, background: "transparent" }}
        />
      )}
    </div>
  );
};

export default LoadingSpinner;
