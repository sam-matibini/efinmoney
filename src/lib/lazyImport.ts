import { lazy, type ComponentType } from "react";

const CHUNK_RELOAD_KEY = "efin_chunk_reload_v1";

function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Loading chunk") ||
    msg.includes("ChunkLoadError")
  );
}

/**
 * Lazy-load with one automatic hard-reload when hashed chunks are missing
 * after a deploy (stale index.html / CDN cache mismatch).
 */
export function lazyImport<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    factory()
      .then((mod) => {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        return mod;
      })
      .catch((err) => {
        if (isChunkLoadError(err) && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
          window.location.reload();
          return new Promise<{ default: T }>(() => {});
        }
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        throw err;
      }),
  );
}
