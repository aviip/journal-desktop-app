# Journal App

A fullscreen, distraction-free journaling app inspired by Freewrite.

- Fullscreen-first editor
- Autosave locally (stored in `localStorage`)
- Minimal UI that auto-hides while you write

## Dev

- `npm run dev` (Electron + Vite)
- `npm run dev:payments` (required for Razorpay paywall)
- `npm run build`
- `npm run lint`

## Distribute (installers)

Build installers for your current OS:

- `npm run dist`

Or per-platform (must be run on that OS):

- Windows: `npm run dist:win`
- macOS: `npm run dist:mac`
- Linux: `npm run dist:linux`

Output goes to `release/`.

### GitHub Releases (recommended)

This repo includes a GitHub Actions workflow that builds Windows/macOS/Linux installers when you push a tag like `v1.0.0`.

- `git tag v1.0.0`
- `git push origin v1.0.0`

## Shortcuts

- `F11` or `Ctrl/⌘+Enter`: toggle fullscreen
- `Ctrl/⌘+N`: new entry
- `Ctrl/⌘+H`: toggle history sidebar
- `Ctrl/⌘+E`: export (requires Razorpay unlock)
- `Esc`: close history sidebar

## Razorpay setup

The export button is paywalled via Razorpay and requires a small local payments server in dev.

- Create `.env` (in repo root) with:
  - `RAZORPAY_KEY_ID=...`
  - `RAZORPAY_KEY_SECRET=...`
  - `EXPORT_PRICE_INR_PAISE=9900` (₹99.00)
  - `PORT=8787`
