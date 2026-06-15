## Issue

The preview shows "live preview lost connection." A direct request to the dev server at `http://localhost:8080/` returns HTTP `000` (no response), meaning the Vite dev server is wedged / not serving. The CSS issue from the previous turn is already fixed (the Google Fonts `@import` is at the top of `src/index.css`), so this is a stuck process, not a source error.

## Fix

1. Restart the Vite dev server in the sandbox (no project file changes).
2. Verify the server responds (`GET /` returns 200) and that the preview renders without the lost-connection banner.

No code changes are required.