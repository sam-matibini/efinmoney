## Compact FX Calculator + lifestyle imagery in hero

**Goal:** shrink the calculator and pair it with a generated image of a Black African family and Canadian/USA professionals reviewing the calculator — without disturbing the `"Send money across borders, instantly."` headline on the left.

### 1. Shrink the calculator (`src/components/landing/FxCalculator.tsx`)
- Outer max width: `max-w-md` → `max-w-sm` (and `max-w-[340px]` on lg).
- Padding `p-5 sm:p-6` → `p-4`.
- Amount input font: `text-2xl sm:text-3xl` → `text-xl sm:text-2xl`.
- Currency picker height `h-11` → `h-9`, badges padding tightened.
- CTAs `h-12` → `h-10`, font `text-sm` → `text-[13px]`.
- Comparison strip: tighter spacing (`p-3.5` → `p-3`, `mt-4` → `mt-3`).
- Swap button `w-9 h-9` → `w-8 h-8`.
- Section label/timestamp text reduced by 1 step.
- No logic changes — bidirectional editing, searchable picker, intent handoff all preserved.

### 2. New hero lifestyle image
- Generate `src/assets/landing-hero-users.jpg` via `imagegen` (premium, ~1280×960):
  > "Editorial photo collage: a warm, smiling Black African family at a wooden kitchen table in Lagos looking together at a smartphone, beside a young Black Canadian professional couple in a bright Toronto loft also looking at a phone, soft natural light, shallow depth of field, candid, premium fintech lifestyle, no on-screen UI, no text"
- The image depicts users *deciding/simulating a transfer* (looking at phones) — the calculator floats over it.

### 3. Hero right column layout (`src/pages/Landing.tsx`, ~lines 294-301)
- Replace the current right column with a single relative stage:
  ```
  <div className="relative w-full max-w-[520px] lg:ml-auto">
    <img src={heroUsers} alt="Families in Africa and professionals in Canada deciding to transfer money with eFinMoney" className="w-full h-[420px] lg:h-[480px] object-cover rounded-3xl ring-1 ring-white/10 shadow-2xl" />
    <div className="absolute inset-0 bg-gradient-to-tr from-[hsl(248_60%_8%)]/70 via-transparent to-transparent rounded-3xl" />
    <div className="absolute -bottom-6 -right-4 lg:-right-8 w-[300px] sm:w-[330px]">
      <FxCalculator />
    </div>
  </div>
  ```
- Phone mockups (`WalletScreen`, `ExchangeScreen`) removed from hero (calculator + photo replace them). They remain defined in the file for any other use.
- Left copy column (headline `"Send money across borders, instantly."`, sub-copy, CTA, press strip) is **untouched**.

### Files
- **Edit:** `src/components/landing/FxCalculator.tsx` — sizing only.
- **Edit:** `src/pages/Landing.tsx` — replace right-column block; add `heroUsers` import.
- **New asset:** `src/assets/landing-hero-users.jpg` (generated).
