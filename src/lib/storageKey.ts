// Supabase Storage keys reject non-ASCII characters (en-dash, curly quotes, etc.)
// and many symbols. Replace anything outside a safe ASCII set with `_`, then
// collapse repeats. Preserves the file extension so downloads still work.
export const sanitizeStorageFilename = (name: string): string => {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const clean = (s: string) =>
    s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const safeStem = clean(stem) || "file";
  const safeExt = ext ? "." + clean(ext.slice(1)) : "";
  return safeStem + safeExt;
};
