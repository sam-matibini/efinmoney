/** Shared signup / reset password rules. */

export const PASSWORD_MIN_LENGTH = 8;

export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) issues.push(`at least ${PASSWORD_MIN_LENGTH} characters`);
  if (!/[A-Z]/.test(password)) issues.push("one uppercase letter");
  if (!/[a-z]/.test(password)) issues.push("one lowercase letter");
  if (!/[0-9]/.test(password)) issues.push("one number");
  return issues;
}

export function isPasswordStrong(password: string): boolean {
  return passwordIssues(password).length === 0;
}

export function passwordPolicyMessage(password: string): string | null {
  const issues = passwordIssues(password);
  if (!issues.length) return null;
  return `Password needs ${issues.join(", ")}.`;
}
