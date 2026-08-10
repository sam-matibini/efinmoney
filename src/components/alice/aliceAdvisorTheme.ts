/**
 * Alice Advisor — aligned with eFinMoney system brand
 * (deep indigo / purple + amber gold accents from landing & CSS tokens).
 */
export const ALICE_BRAND = "#1A0F3C";
export const ALICE_BRAND_SOFT = "#2B1A5E";
export const ALICE_BRAND_MID = "#4F2FD6";
export const ALICE_ACCENT = "#FFB800";
export const ALICE_CREAM = "#F6F4FB";

/** @deprecated Use ALICE_BRAND — kept so existing imports keep working */
export const ALICE_FOREST = ALICE_BRAND;
/** @deprecated Use ALICE_BRAND_SOFT */
export const ALICE_FOREST_SOFT = ALICE_BRAND_SOFT;

export type AliceTab = "home" | "messages" | "call" | "help" | "tasks";

/** Filled nav cell colors (icon + label sit on a tinted chip). */
export const ALICE_NAV_CELLS: Record<
  Exclude<AliceTab, "call">,
  { fill: string; fillActive: string; ink: string; inkActive: string }
> = {
  home: {
    fill: "#EDE7FF",
    fillActive: "#6D4CFF",
    ink: "#4F2FD6",
    inkActive: "#FFFFFF",
  },
  messages: {
    fill: "#E0F2FE",
    fillActive: "#0EA5E9",
    ink: "#0369A1",
    inkActive: "#FFFFFF",
  },
  help: {
    fill: "#FFE8CC",
    fillActive: "#FFB800",
    ink: "#9A6700",
    inkActive: "#1A0F3C",
  },
  tasks: {
    fill: "#DCFCE7",
    fillActive: "#16A34A",
    ink: "#166534",
    inkActive: "#FFFFFF",
  },
};
