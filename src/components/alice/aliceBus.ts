// Lightweight bus so any page can open the Alice widget (and pick a mode)
// without importing the lazy-loaded AliceWidget and eagerly pulling it in.
import type { AliceTab } from "@/components/alice/aliceAdvisorTheme";

export type AliceMode = "alice" | "home" | "messages" | "call" | "help" | "tasks" | "support" | "booking";

export const ALICE_OPEN_EVENT = "alice:open";

export function modeToTab(mode?: AliceMode): AliceTab {
  if (mode === "messages" || mode === "call" || mode === "help" || mode === "tasks" || mode === "home") {
    return mode;
  }
  // legacy "alice" and overlays open on home (call is one tap away)
  return "home";
}

/** Open the Alice widget, optionally jumping straight to a mode (e.g. "call"). */
export function openAlice(mode: AliceMode = "home") {
  window.dispatchEvent(new CustomEvent(ALICE_OPEN_EVENT, { detail: { mode } }));
}
