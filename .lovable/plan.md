# Landing — Tourism & Africa Travel Band

Add a new "Tourism powers transfers" band on the landing page below the existing "Built for the African continent" section, showcasing iconic African destinations to reinforce the tourism → remittance story.

## Changes

### New section: "Tourism powers transfers"
Placed between the existing **Built for Africa** section and the **Features** section.

Layout: 3-column image grid on top, short copy block below (centered).

Images (generated, then imported as ES6):
1. `landing-tourism-kenya.jpg` — Kenyan safari at golden hour: elephants and giraffes on the Maasai Mara plains with acacia trees, Mount Kilimanjaro faint on the horizon. Photoreal.
2. `landing-tourism-victoria-falls.jpg` — Victoria Falls cascading over the Zambia/Zimbabwe border with rainbow in the mist, lush green cliffs. Photoreal aerial-ish wide shot.
3. `landing-tourism-zanzibar.jpg` — A second supporting destination (Zanzibar turquoise coastline with dhow boat) to balance the grid visually. (Optional — keeps the 3-up rhythm consistent.)

Each image:
- Rounded card, `shadow-card-purple`, ring border
- Caption overlay (bottom-left chip): "🇰🇪 Maasai Mara · Kenya", "🇿🇲🇿🇼 Victoria Falls", "🇹🇿 Zanzibar"
- Subtle gradient overlay so caption stays legible

Copy block:
- Eyebrow chip: "Tourism & remittances"
- H2: "Wherever travel takes you, money follows."
- Sub: One short paragraph explaining that millions of travellers, families and businesses send money into Kenya, Zambia, Zimbabwe and beyond every year — eFinMoney makes those flows instant and affordable.

### Color scheme
Unchanged — uses existing purple/amber tokens (`--brand-900`, `--accent-amber`, `--accent`).

## Files touched
- `src/pages/Landing.tsx` — insert new section, add 2–3 image imports
- `src/assets/landing-tourism-kenya.jpg` (new)
- `src/assets/landing-tourism-victoria-falls.jpg` (new)
- `src/assets/landing-tourism-zanzibar.jpg` (new, optional 3rd tile)

## Out of scope
- No color, nav, footer, or routing changes
- No backend/data changes
