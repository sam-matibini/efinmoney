## Calculator in the middle, family on either side

Right now the hero shows one split-scene photo on the left with the calculator floating on top-right. The user wants the calculator centered, with the **sending Canada/USA couple on one side** and the **receiving African grandma + kids on the other** — visually flowing money through the calculator.

### 1. Split the single hero image into two
Generate two new images (replace/retire the current `landing-hero-users.jpg`):

- **`src/assets/landing-senders.jpg`** (portrait, 768×1024):
  > "Editorial photo of a warm young Black Canadian/American professional couple in a bright modern Toronto loft, smiling together while looking at a smartphone, clearly the senders of a family transfer. Soft natural daylight, shallow depth of field, candid, premium fintech lifestyle, no on-screen UI text, no logos."

- **`src/assets/landing-receivers.jpg`** (portrait, 768×1024):
  > "Editorial photo of a warm, smiling Black African grandmother in Lagos at her sunlit doorway joyfully receiving money on her smartphone (soft glow notification on phone screen, no readable text), her small grandchild hugging her side. Soft natural light, shallow depth of field, candid, premium fintech lifestyle, no on-screen UI text, no logos."

### 2. Restructure the hero right column (`src/pages/Landing.tsx`)
Replace the single-image + floating-calculator block with a **3-zone composition where the calculator is the centerpiece**:

```
Desktop (lg+):
  [ senders photo ]   [ FX CALCULATOR ]   [ receivers photo ]
        ↘ arrow/gradient money-flow ↘   ↘ arrow ↘

Mobile:
  [ senders photo ]
  [ FX CALCULATOR ]
  [ receivers photo ]
```

Structure:
```tsx
<div className="relative w-full max-w-[640px] lg:ml-auto">
  {/* Soft amber glow behind calculator */}
  <div className="hidden lg:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] bg-[hsl(var(--accent-amber)/0.25)] blur-3xl rounded-full pointer-events-none" />

  <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 lg:gap-2 items-center">
    {/* Senders — left on desktop, top on mobile */}
    <div className="relative">
      <img src={senders} alt="Family in Canada sending money home" className="w-full h-[180px] lg:h-[360px] object-cover rounded-2xl ring-1 ring-white/10 shadow-xl" loading="lazy" />
      <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider bg-white/15 backdrop-blur ring-1 ring-white/20 text-white rounded-full px-2 py-0.5">Sending · Canada</span>
    </div>

    {/* Calculator — middle */}
    <div className="relative z-10 lg:-mx-4">
      <FxCalculator />
    </div>

    {/* Receivers — right on desktop, bottom on mobile */}
    <div className="relative">
      <img src={receivers} alt="Grandmother in Africa receiving money" className="w-full h-[180px] lg:h-[360px] object-cover rounded-2xl ring-1 ring-white/10 shadow-xl" loading="lazy" />
      <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider bg-white/15 backdrop-blur ring-1 ring-white/20 text-white rounded-full px-2 py-0.5">Receiving · Africa</span>
    </div>
  </div>
</div>
```

- Calculator stays at its current compact size (`max-w-[340px]`); on `lg+` it slightly overlaps both photos via `lg:-mx-4` and `z-10` so it visually sits *in front of* and *between* them, like money flowing left → calculator → right.
- Amber radial glow behind the calculator anchors the center.
- Small badges ("Sending · Canada" / "Receiving · Africa") make the visual story explicit without competing with the headline.
- Left copy column (`"Send money across borders, instantly."`, sub-copy, CTAs, press strip) — **untouched**.

### 3. Cleanup
- Old `src/assets/landing-hero-users.jpg` is no longer used after this change. Delete it to keep the repo clean.

### Files
- **New:** `src/assets/landing-senders.jpg`, `src/assets/landing-receivers.jpg`
- **Edit:** `src/pages/Landing.tsx` (swap image import + right-column markup)
- **Delete:** `src/assets/landing-hero-users.jpg`
- **No changes:** `FxCalculator.tsx`, `worldCurrencies.ts`, left hero copy column.
