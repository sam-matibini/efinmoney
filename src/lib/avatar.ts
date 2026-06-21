type ProfileLike = { avatar_url?: string | null; full_name?: string | null; email?: string | null } | null | undefined;
type UserLike = { user_metadata?: Record<string, unknown> } | null | undefined;

export function resolveAvatarUrl(profile?: ProfileLike, user?: UserLike): string | null {
  if (profile?.avatar_url) return profile.avatar_url;
  const meta = user?.user_metadata;
  return (meta?.avatar_url as string | undefined) ?? (meta?.picture as string | undefined) ?? null;
}

export function avatarInitials(profile?: ProfileLike, user?: UserLike): string {
  const name = profile?.full_name?.trim();
  if (name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "E";
  }
  const email = profile?.email ?? (user as { email?: string } | null)?.email;
  return (email?.[0] ?? "E").toUpperCase();
}

export const AVATAR_BUCKET = "avatars";

export function avatarStoragePath(userId: string, ext: string) {
  return `${userId}/avatar.${ext}`;
}
