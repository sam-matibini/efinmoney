export type KycApprovalEmailResult = {
  email_sent?: boolean;
  email?: string | null;
  email_error?: string | null;
};

export function pickAccountEmail(...candidates: Array<string | null | undefined>): string | null {
  for (const value of candidates) {
    const email = (value || "").trim();
    if (email) return email;
  }
  return null;
}

export function kycApprovalToast(
  result: KycApprovalEmailResult,
  options?: { overridden?: boolean; fallbackEmail?: string | null },
): { level: "success" | "error"; message: string } {
  const to = pickAccountEmail(result.email, options?.fallbackEmail);
  const lead = options?.overridden ? "Decision overridden — approved" : "Verification approved";
  if (result.email_sent === false) {
    const reason = (result.email_error || "").trim();
    return {
      level: "error",
      message: reason
        ? `${lead}, but the notification email was not sent. ${reason}`
        : `${lead}, but the notification email was not sent.`,
    };
  }
  return {
    level: "success",
    message: to ? `${lead} — notification email sent to ${to}` : `${lead} — notification email sent`,
  };
}
