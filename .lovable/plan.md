# Landing page: feature photos + live markets ticker

## 1. Real photos on the 3 feature cards
Add a photographic header image to each card in the "Built for the way you move money" section.

Generate 3 new assets (photoreal, on-brand, dark/purple-friendly):
- `src/assets/landing-feature-security.jpg` — vault door / biometric fingerprint on glass / server room with subtle purple lighting → **Bank-Grade Security**
- `src/assets/landing-feature-instant.jpg` — phone showing a "Transfer sent" confirmation with motion-blur light streaks → **Instant Transfers**
- `src/assets/landing-feature-corridors.jpg` — world map / globe with glowing route arcs between Canada, USA, Nigeria, Kenya, Ghana, Zambia → **50+ Currency Corridors**

Card structure update in `src/pages/Landing.tsx`:
- Image sits at the top of the card (h-32 / h-36), `object-cover`, rounded top corners, subtle gradient overlay so existing icon chip floats over it
- Existing icon chip moves to bottom-left of the image (overlap) so the current visual language is preserved
- Title + description stay below, unchanged copy
- No color scheme changes — keep existing purple/amber tokens, shadows, and white card surface

## 2. Rolling live markets ticker
Add a horizontally-scrolling marquee strip showing live-style market data with flags.

Placement: directly under the hero (above the wallet/exchange phone mockups), full-width, sticky band feel with subtle purple gradient border top/bottom.

Contents (mixed fiat + crypto, ~16 items, looped seamlessly):
- Fiat pairs with country flag pairs: 🇺🇸→🇨🇦 USD/CAD, 🇺🇸→🇳🇬 USD/NGN, 🇺🇸→🇰🇪 USD/KES, 🇺🇸→🇬🇭 USD/GHS, 🇺🇸→🇿🇲 USD/ZMW, 🇨🇦→🇳🇬 CAD/NGN, 🇬🇧→🇺🇸 GBP/USD, 🇪🇺→🇺🇸 EUR/USD
- Crypto with coin glyph: ₿ BTC/USD, Ξ ETH/USD, ◎ SOL/USD, ✕ XRP/USD, ★ XLM/USD, ⓤ USDC/USD
- Each item: flag(s) / symbol · ticker · price · green/red delta % with tiny up/down arrow

Data source:
- Use existing `useFxRates()` hook for live fiat rates already in the project
- Crypto values come from a small static seed array (prices are illustrative; matches the existing "mock for landing only" pattern — no new API/edge function in scope)
- Deltas: derived deterministically from the rate (small +/- % so it looks live without being random on each render)

Implementation:
- New component `src/components/landing/MarketTicker.tsx`
- Two duplicated rows inside a flex container, animated via Tailwind keyframes (`animate-[marquee_40s_linear_infinite]`) — pause-on-hover
- Tailwind keyframe added inline in the component (style tag) to avoid touching `tailwind.config.ts`
- Mounted once in `Landing.tsx` between hero and the next section

## Out of scope
- No color scheme changes
- No new routes, no backend changes, no new edge functions
- No changes to the existing African/tourism/B2B sections already on the page

## Files touched
- `src/pages/Landing.tsx` (edit — add ticker import + restructure 3 feature cards)
- `src/components/landing/MarketTicker.tsx` (new)
- `src/assets/landing-feature-security.jpg` (new)
- `src/assets/landing-feature-instant.jpg` (new)
- `src/assets/landing-feature-corridors.jpg` (new)
