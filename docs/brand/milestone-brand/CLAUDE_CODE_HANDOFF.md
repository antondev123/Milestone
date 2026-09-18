# Milestone logo — handoff for Claude Code

Paste the prompt at the bottom into Claude Code after copying this folder into your repo
(for example to `./milestone-brand/`).

## What's in this kit

**svg/** — master artwork (vector, use these wherever possible)
- `milestone-logo.svg` — full lockup for light backgrounds (transparent)
- `milestone-logo-on-dark.svg` — full lockup for dark backgrounds (transparent)
- `milestone-logo-mono.svg` — single colour, uses `currentColor`
- `milestone-mark.svg`, `milestone-mark-on-dark.svg`, `milestone-mark-mono.svg` — symbol only
- `milestone-wordmark.svg` — text only
- `milestone-app-icon.svg` — square, full-bleed (App Store / Play Store round the corners themselves)
- `milestone-app-icon-rounded.svg` — rounded tile for web and marketing
- `milestone-app-icon-maskable.svg` — extra padding for Android adaptive / PWA maskable icons
- `favicon.svg`

**png/**
- `favicon.ico` (16/32/48), `favicon-16/32/48.png`
- `apple-touch-icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
- `app-store-icon-1024.png` (no transparency, as the stores require)
- `milestone-logo@1x/2x/4x.png`, `milestone-logo-on-dark@1x/2x/4x.png` (transparent)
- `milestone-mark-512.png`, `milestone-mark-on-dark-512.png` (transparent)

**react/MilestoneLogo.tsx** — drop-in component, inline SVG, no asset loading
- `variant`: `"full" | "mark" | "wordmark"` (default `full`)
- `theme`: `"light" | "dark" | "mono"` (default `light`; `mono` inherits CSS `color`)
- `height`: number or CSS string (default 40); width scales automatically
- Uses `useId()` so several logos can sit on one page (React 18+)

**brand/**
- `tokens.css` — CSS custom properties + Google Fonts import
- `tokens.json` — same values for JS / design tools / React Native
- `tailwind.config.snippet.js` — colour + font extensions
- `site.webmanifest`, `head-tags.html` — PWA / favicon wiring

## Brand rules
- Colours: ink `#14201B`, sand `#F4EFE6`, yellow `#F2B705`.
- The yellow is an accent (the pin, progress, highlights). Don't use it for body text on light backgrounds; contrast is too low.
- Use the `on-dark` files on any dark or photo background; use `mono` when only one colour is available.
- Clear space around the logo: at least the height of the graduation cap on every side.
- Minimum size: full lockup 24px tall on screen; the mark alone 16px (favicon).
- Don't recolour the pin, stretch the logo, add shadows or outlines, or re-type the wordmark in a live font. The wordmark is outlined Bricolage Grotesque SemiBold.
- UI typeface: Bricolage Grotesque (Google Fonts), fallback Trebuchet MS / system-ui.

## Platform notes
- **Web / Next.js / Vite:** use the React component for in-app logos; copy the favicon and icon files to `public/`.
- **React Native / Expo:** use `png/app-store-icon-1024.png` as `icon` and `png/icon-maskable-512.png` as the Android adaptive foreground (background `#14201B`). For in-app logos use `react-native-svg` with the SVGs (masks are supported), or the PNGs.
- **Native Android vector drawables** don't support SVG masks, so use the PNGs there.
- **Flutter:** `flutter_svg` supports these files; `flutter_launcher_icons` can take `app-store-icon-1024.png`.

---

## Prompt to paste into Claude Code

> I've added a brand kit for my app's new logo at `./milestone-brand/` (the app is called Milestone). Read `milestone-brand/CLAUDE_CODE_HANDOFF.md` first, then:
>
> 1. Look at this project's framework and structure and tell me your plan before changing anything.
> 2. Replace the existing app name/logo in the header, nav, splash/loading screen and any auth screens with the Milestone logo. For React/Next projects, move `react/MilestoneLogo.tsx` into our components folder and use it; otherwise use the SVG files.
> 3. Wire up favicons, the Apple touch icon and the web manifest using the files in `png/` and `brand/`. If this is a mobile app, set the app icon and splash from the kit instead.
> 4. Add the colour and font tokens from `brand/` to our styling setup (Tailwind config, CSS variables or theme file, whichever we use), without breaking existing styles.
> 5. Use the `on-dark` or `mono` variants on any dark surfaces.
> 6. Don't modify the artwork itself. Show me a summary of every file you changed when done.
