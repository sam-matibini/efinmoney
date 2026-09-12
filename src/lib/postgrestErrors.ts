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

/** RPC is not in the schema cache yet (migration not applied / PostgREST not reloaded). */
export function isPostgrestMissingRpcError(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const msg = String(error.message ?? "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    msg.includes("could not find the function")
  );
}

export function isIgnorableInteracEmailPersistError(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  return isPostgrestSchemaCacheError(error) || isPostgrestMissingRpcError(error);
}
