/** Maps header nav labels to exported PNG assets in /public/icons/nav/ */

export const NAV_ICON_FILES: Record<string, string> = {
  Dashboard: "dashboard",
  Send: "send",
  "Payment Links": "payment-links",
  "Top up": "top-up",
  Receive: "wallets",
  "Bank account": "wallets",
  Contacts: "contacts",
  "Foreign Currency Exchange": "fx-exchange",
  Wallets: "wallets",
  Cards: "cards",
  Business: "business",
  Finance: "finance",
  Operations: "operations",
  Admin: "admin",
  Settings: "dashboard",
};

export function navIconSrc(label: string) {
  const file = NAV_ICON_FILES[label] ?? "dashboard";
  return `/icons/nav/${file}.png`;
}

export const navIconImgClass = "w-5 h-5 sm:w-[22px] sm:h-[22px] shrink-0 object-contain drop-shadow-sm";
export const navIconImgClassMobile = "w-5 h-5 shrink-0 object-contain drop-shadow-sm";
