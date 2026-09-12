/** PostgREST has not reloaded after a column was added (or the migration never ran). */
export function isPostgrestSchemaCacheError(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const msg = String(error.message ?? "");
  return (
    code === "PGRST204" ||
    code === "42703" ||
    /schema cache/i.test(msg) ||
    (/could not find/i.test(msg) && /column/i.test(msg))
  );
}

type ProfileClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
      };
    };
  };
};

/** Select profile columns, retrying without ones that are missing from the schema cache. */
export async function selectProfileRow<T>(
  client: ProfileClient,
  userId: string,
  columns: string,
  fallbackColumns: string,
): Promise<T | null> {
  const first = await client.from("profiles").select(columns).eq("user_id", userId).maybeSingle();
  if (first.error && isPostgrestSchemaCacheError(first.error)) {
    const retry = await client.from("profiles").select(fallbackColumns).eq("user_id", userId).maybeSingle();
    return ((retry.data as T | null) ?? null);
  }
  if (first.error) return null;
  return (first.data as T | null) ?? null;
}
