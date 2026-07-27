// Loads the Tawk.to live-support embed lazily, only for authenticated shells.
// It is intentionally NOT in index.html so anonymous/public pages (home, about,
// features …) never load Tawk — otherwise a broadcast/triggered agent message
// flips the browser tab title to "N new message" for visitors with no
// personalized conversation. Live support still opens from Alice → "Talk to a
// human" once this has run.

const TAWK_SRC = "https://embed.tawk.to/6a6609b9846c4d1d49b067ed/1juf9c01a";

let loaded = false;

export function loadTawk() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;

  const w = window as typeof window & {
    Tawk_API?: Record<string, unknown>;
    Tawk_LoadStart?: Date;
  };

  const api = (w.Tawk_API = w.Tawk_API || {});
  w.Tawk_LoadStart = new Date();

  api.customStyle = { zIndex: 99990 };
  // Hide the purple bubble so Alice is the only floating chat button.
  api.onLoad = function () {
    try {
      (w.Tawk_API as { hideWidget?: () => void })?.hideWidget?.();
    } catch { /* ignore */ }
  };
  api.onChatMinimized = function () {
    try {
      (w.Tawk_API as { hideWidget?: () => void })?.hideWidget?.();
    } catch { /* ignore */ }
  };

  const s1 = document.createElement("script");
  const s0 = document.getElementsByTagName("script")[0];
  s1.async = true;
  s1.src = TAWK_SRC;
  s1.charset = "UTF-8";
  s1.setAttribute("crossorigin", "*");
  s0.parentNode?.insertBefore(s1, s0);
}
