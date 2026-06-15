## Problem

The preview is blank because `src/index.css` fails to compile. Vite reports:

> [vite:css] @import must precede all other statements (besides @charset or empty @layer)

Lines 1-5 currently are:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk...');
```

The `@import` sits after the `@tailwind` directives, which violates the CSS spec, so the stylesheet fails to load and the app renders nothing.

## Fix

Reorder the top of `src/index.css` so the Google Fonts `@import` is the first statement:

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;
```

No other changes. After saving, the dev server will recompile and the preview will render normally.
