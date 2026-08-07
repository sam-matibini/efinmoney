// Training requirement tiers.
//
// Tier 1  requirement_type = 'all_staff'   → mandatory for everyone
// Tier 2  requirement_type = 'role_based'  → mandatory for the roles in applies_to_roles
// Tier 3  requirement_type = 'elective'    → self-enrol, never overdue

export type RequirementType = "all_staff" | "role_based" | "elective";

export const STAFF_ROLES = [
  "super_admin",
  "compliance_officer",
  "finance_officer",
  "support_agent",
  "viewer",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const REQUIREMENT_OPTIONS: Array<{ value: RequirementType; label: string; hint: string }> = [
  { value: "all_staff", label: "All staff", hint: "Every active staff member must complete it." },
  { value: "role_based", label: "By role", hint: "Auto-assigned to the selected roles only." },
  { value: "elective", label: "Elective", hint: "Optional — tracked but never overdue." },
];

export const roleLabel = (role: string | null | undefined) =>
  (role || "unassigned").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

export const requirementLabel = (t: string | undefined | null) =>
  t === "all_staff" ? "All staff" : t === "role_based" ? "By role" : "Elective";

/** Fall back to the legacy is_mandatory flag when the tier columns aren't populated yet. */
export const requirementOf = (course: { requirement_type?: string | null; is_mandatory?: boolean | null }): RequirementType => {
  const t = course.requirement_type;
  if (t === "all_staff" || t === "role_based" || t === "elective") return t;
  return course.is_mandatory ? "all_staff" : "elective";
};

/** Is this course required for a staff member holding `role`? */
export const isRequiredFor = (
  course: { requirement_type?: string | null; is_mandatory?: boolean | null; applies_to_roles?: string[] | null },
  role: string | null | undefined,
): boolean => {
  const t = requirementOf(course);
  if (t === "all_staff") return true;
  if (t === "elective") return false;
  const roles = Array.isArray(course.applies_to_roles) ? course.applies_to_roles : [];
  return !!role && roles.includes(role);
};

/** Days between now and a date (negative = in the past). */
const daysUntil = (d: Date) => Math.ceil((d.getTime() - Date.now()) / 86_400_000);

export type CellState = "current" | "due_soon" | "expired" | "onboarding_overdue" | "missing";

/**
 * Status of one course for one staff member.
 * `completedAt` / `expiryDate` come from the newest passing training record.
 * `activatedAt` is when the staff member became active (onboarding clock start).
 */
export const courseState = (opts: {
  completedAt?: string | null;
  expiryDate?: string | null;
  onboardingDueDays?: number | null;
  activatedAt?: string | null;
}): CellState => {
  const { completedAt, expiryDate, onboardingDueDays, activatedAt } = opts;
  if (completedAt) {
    if (expiryDate) {
      const left = daysUntil(new Date(expiryDate));
      if (left < 0) return "expired";
      if (left <= 30) return "due_soon";
    }
    return "current";
  }
  if (onboardingDueDays && activatedAt) {
    const due = new Date(activatedAt);
    due.setDate(due.getDate() + onboardingDueDays);
    if (daysUntil(due) < 0) return "onboarding_overdue";
  }
  return "missing";
};

export const STATE_LABEL: Record<CellState, string> = {
  current: "Current",
  due_soon: "Due soon",
  expired: "Overdue",
  onboarding_overdue: "Onboarding overdue",
  missing: "Not started",
};

export const STATE_CLASS: Record<CellState, string> = {
  current: "bg-emerald-500/10 text-emerald-600",
  due_soon: "bg-amber-500/10 text-amber-600",
  expired: "bg-red-500/10 text-red-600",
  onboarding_overdue: "bg-red-500/10 text-red-600",
  missing: "bg-muted text-muted-foreground",
};
