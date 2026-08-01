// Lightweight bus so any page can open the Alice widget (and pick a mode)
// without importing the lazy-loaded AliceWidget and eagerly pulling it in.
export type AliceMode = "alice" | "support" | "booking";

export const ALICE_OPEN_EVENT = "alice:open";

/** Open the Alice widget, optionally jumping straight to a mode (e.g. "booking"). */
export function openAlice(mode: AliceMode = "alice") {
  window.dispatchEvent(new CustomEvent(ALICE_OPEN_EVENT, { detail: { mode } }));
}
