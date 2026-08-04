/**
 * Deterministic per-user avatar colors.
 * The same seed (user id) always maps to the same palette entry,
 * so a person keeps one identity color everywhere in the app.
 */

const PALETTE = [
  "bg-avatar-1 text-avatar-1-foreground",
  "bg-avatar-2 text-avatar-2-foreground",
  "bg-avatar-3 text-avatar-3-foreground",
  "bg-avatar-4 text-avatar-4-foreground",
  "bg-avatar-5 text-avatar-5-foreground",
  "bg-avatar-6 text-avatar-6-foreground",
  "bg-avatar-7 text-avatar-7-foreground",
  "bg-avatar-8 text-avatar-8-foreground",
  "bg-avatar-9 text-avatar-9-foreground",
  "bg-avatar-10 text-avatar-10-foreground",
] as const;

const hash = (seed: string) => {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const avatarColorClasses = (seed?: string | null) =>
  PALETTE[hash(seed || "?") % PALETTE.length];

export default avatarColorClasses;
