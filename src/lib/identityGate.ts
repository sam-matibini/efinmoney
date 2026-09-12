/** Personal KYC vs business KYB — business accounts never complete personal KYC. */

export function isPersonalKycApproved(
  profile?: { kyc_status?: string | null } | null,
): boolean {
  const s = String(profile?.kyc_status || "").toLowerCase();
  return s === "approved" || s === "verified";
}

export function isBusinessKybApproved(
  business?: { kyb_status?: string | null } | null,
): boolean {
  return String(business?.kyb_status || "").toLowerCase() === "approved";
}

/**
 * Bank receive accounts (virtual NUBAN / GHS) need identity on file.
 * A business profile uses KYB only — personal KYC is not required.
 */
export function canIssueBankReceiveAccount(opts: {
  profile?: { kyc_status?: string | null } | null;
  business?: { id?: string; kyb_status?: string | null } | null;
}): boolean {
  if (opts.business?.id) return isBusinessKybApproved(opts.business);
  return isPersonalKycApproved(opts.profile);
}
