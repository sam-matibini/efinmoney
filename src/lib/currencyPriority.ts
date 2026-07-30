export const PRIORITY_SEND_CURRENCIES = ["CAD", "USD", "EUR", "NGN"] as const;

export type PriorityCurrency = (typeof PRIORITY_SEND_CURRENCIES)[number];

const priorityIndex = (code: string, priority: readonly string[]) => {
  const i = priority.indexOf(code);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
};

export const sortByPriority = <T extends string>(codes: T[], priority: readonly string[] = PRIORITY_SEND_CURRENCIES): T[] =>
  [...codes].sort((a, b) => {
    const pa = priorityIndex(a, priority);
    const pb = priorityIndex(b, priority);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
