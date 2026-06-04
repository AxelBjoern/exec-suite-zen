## Goal

Make VDNX Terminal installable on your phone's home screen as a PWA — manifest only, no offline/service worker.

## Changes

**1. Create `public/manifest.webmanifest`**
- `name`: "VDNX Terminal"
- `short_name`: "VDNX"
- `description`: matches existing meta
- `start_url`: "/"
- `scope`: "/"
- `display`: "standalone"
- `background_color` + `theme_color`: derived from existing app palette (dark navy `#1c2438` background, gold `#c9a96a` theme accent — taken from styles.css oklch tokens)
- `orientation`: "portrait"
- `icons`: 192x192 and 512x512 (regular + maskable)

**2. Generate app icons (in `public/`)**
- `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180x180)
- Style: VDNX monogram on dark navy background with gold accent, matching terminal aesthetic

**3. Update `src/routes/__root.tsx` head**
Add to `links` and `meta`:
- `<link rel="manifest" href="/manifest.webmanifest">`
- `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`
- `<meta name="theme-color" content="#1c2438">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-title" content="VDNX">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`

## Not included
- No service worker, no `vite-plugin-pwa`, no offline caching (per your choice). App requires internet to load, same as today.

## How to install after deploy
- **iOS Safari**: Share → Add to Home Screen
- **Android Chrome**: menu → Install app / Add to Home Screen

Install prompts only appear on the published `.lovable.app` URL (or your custom domain), not in the editor preview.