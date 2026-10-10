<div align="center">

<img src="public/favicon.svg" width="88" alt="Dannz AI Studio logo" />

# Dannz AI Background & Image Studio

**Local-first AI background removal, batch processing and image editing — free, no accounts, no paid APIs.**

`Python (rembg / ONNX)` • `React + TypeScript + Vite` • `Tailwind CSS` • `Fabric.js canvas` • `PWA`

[Live Demo](#) · [Report an Issue](#) · [Vercel Deploy](#deployment)

</div>

---

## What it is

Dannz AI Studio is a professional-grade web tool that runs an open-source U²-Net / IS-Net
neural network to cut subjects out of photos. Everything that can happen on your machine
happens on your machine; only the actual AI inference has a (free) serverless path.

```
┌─────────────────────────── Browser (client-heavy) ───────────────────────────┐
│  Presentation    React 18 + Tailwind + design tokens, dark/light, EN/VI      │
│  Canvas          Fabric.js infinite workspace, pan/zoom 60-120 FPS           │
│  Adjustments     Brightness · Contrast · Saturation · Hue · Blur · Sharpen    │
│  Pipeline        composite · resize · crop · convert · compress · zip        │
│  Persistence     IndexedDB (images, results, settings, history, accounts)    │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │  POST /api/remove_bg
                                   ▼
┌─────────────────────────── Serverless (Python) ──────────────────────────────┐
│  Vercel Function   rembg + onnxruntime, warm ONNX session cache              │
│  Models            u2netp · u2net · isnet-general-use · u2net_human_seg · …  │
│  Status            GET /api/health  → model list + cache warm state          │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature map

| Module | What you get |
|---|---|
| **Drag & Drop Uploader** | Drop anywhere in the window, or browse. Accepts JPG, PNG, WebP, GIF, BMP, TIFF. Global drag veil highlights the whole viewport. |
| **AI Background Removal** | One click cutout via ONNX Runtime. 5 models, max-edge cap (320–2400 px) for speed, optional alpha matting (foreground/background threshold + erode size) for hair and fur. |
| **Batch Processing** | Queue many files, run the pipeline sequentially with a live progress bar and per-file status (`pending` → `processing` → `done` / `failed`). Cancel mid-run. |
| **Manual Region Erase** | Draw rectangles directly on the cut-out for anything the AI left behind — each rectangle is stored in image pixel space, listed, individually removable, then applied with one click (result is committed as a new version). |
| **Comparison Grid** | Side-by-side *or* interactive before/after slider. Live stats: dimensions, size before, size after, bytes saved, processing time. |
| **Solid Background Composite** | Transparent, White, Black, Slate Gray or any custom HEX, composited on canvas before encode. |
| **Image Optimization** | Re-encode to PNG / JPG / WebP with a quality slider; JPEG/WebP flatten alpha onto white automatically. |
| **Smart Cropping & Resizing** | Exact pixel resize with optional aspect-ratio preservation, plus centre-crop to 1:1, 16:9, 4:3 or 3:2. |
| **Keyboard Shortcuts** | `Ctrl+Enter` process active · `Ctrl+Shift+Enter` process batch · `Ctrl+S` download ZIP · `1` / `2` / `3` switch view · `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo in the workspace |
| **Dynamic Workspace** | Fabric.js canvas: scroll to zoom, drag to pan, Ctrl+Z / Ctrl+Y restore stack, floating glass toolbar. |
| **Non-Destructive Editing** | Adjustment sliders are re-applied as canvas filters, so nothing is baked in until you export. |
| **Layer Stack** | Base cutout layer listed with visibility, opacity, index and blend-mode reference. |
| **Presets** | Product Photo · Portrait · Cyberpunk · Cinematic · Clean Web — one click applies model, background, format and adjustments. |
| **Export Center** | Format, quality, scale (10–200 %) and background, with an on-canvas preview and single or ZIP download. |
| **Local Accounts** | Salted SHA-256 hashes in IndexedDB (Web Crypto). Export/import a `dannz-sync.json` to move settings between devices — no server database. |
| **History Log** | Timeline of uploads, processing runs, presets and exports, persisted across sessions. |
| **i18n** | Full English and Vietnamese dictionaries, switchable at runtime, including toast messages. |
| **Theme** | Dark by default, light "cream paper" variant. Persisted and applied before first paint (no flash). |
| **PWA** | Manifest, maskable icons, installable, offline shell with per-request cache strategy. |
| **Neural Scan overlay** | Processing stages (removing background → compositing → resizing → finalizing) with progress + cancel. |

---

## Project structure

```
dannz-ai-studio/
├── api/
│   ├── remove_bg.py          # Vercel serverless background-removal endpoint
│   ├── health.py             # GET /api/health — model list + cache state
│   ├── server.py             # local dev router for both endpoints
│   └── requirements.txt      # rembg, onnxruntime, pillow, numpy
├── public/
│   ├── favicon.svg           # brand mark (vector)
│   ├── favicon.ico
│   ├── apple-touch-icon.png
│   ├── icon-192/512*.png     # + maskable variants
│   ├── manifest.webmanifest
│   ├── offline.html
│   └── sw.js                 # service worker (cache strategies)
├── scripts/
│   └── generate_icons.py     # regenerates every PNG/ICO from the SVG mark
├── src/
│   ├── assets/icons/         # 38 hand-written SVG icons (no emoji, no icon font)
│   ├── components/
│   │   ├── layout/           # TopBar · LeftSidebar · RightPanel · StatusBar · AppShell
│   │   ├── workspace/        # DropZone · ComparisonView · CanvasWorkspace · ProcessingOverlay
│   │   ├── panels/           # AIPanel · AdjustPanel · LayersPanel · PresetsPanel · HistoryPanel · RegionPanel
│   │   ├── batch/            # BatchQueue
│   │   ├── export/           # ExportModal
│   │   ├── auth/             # AuthModal
│   │   ├── settings/         # SettingsModal
│   │   └── ui/               # Icon · Modal · Toasts · Fields
│   ├── contexts/             # ThemeContext · LanguageContext · AuthContext · StudioContext
│   ├── hooks/                # useCanvas · useKeyboardShortcuts
│   │   └── (region drawing lives in StudioContext — single source of truth)
│   ├── services/             # api.ts · auth.ts · zip.ts
│   ├── styles/globals.css    # design tokens + @font-face + component classes
│   ├── i18n/index.ts         # en + vi dictionaries
│   ├── types/index.ts        # shared domain types + presets
│   ├── utils/                # storage (IndexedDB) · progress · toast · registerSW
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── package.json
├── vercel.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── tsconfig.node.json
```

---

## Local setup

**Requirements:** Node 18+, Python 3.9+ (only if you want the API locally).

### 1 — Install

```bash
git clone <your-repo-url>
cd dannz-ai-studio
npm install
```

### 2 — Frontend only (fastest start)

```bash
npm run dev          # http://localhost:3000
```

The app boots immediately. Without a running API the status dot turns red and
**all canvas features still work** — uploads, comparison, adjustments, presets,
resize, crop, format conversion, compression, export and ZIP.

### 3 — With the AI background-removal API

```bash
# terminal 1 — Python API (Vite proxies /api -> :8000 automatically)
npm run api:install
npm run api              # http://127.0.0.1:8000

# terminal 2 — frontend
npm run dev
```

The first request downloads the model weights (~5 MB for `u2netp`, ~170 MB for
`u2net` / `isnet-general-use`) into `~/.rembg/models` and stays warm afterwards.

> macOS/Linux Apple-silicon: if `onnxruntime` has no wheel for your Python, use
> Python 3.10–3.11, or `pip install onnxruntime-silicon`.

### 4 — Verify everything

```bash
npm run typecheck     # tsc --noEmit (app + node projects)
npm run build         # tsc && vite build → dist/
npm run preview       # serve the production build locally

curl http://127.0.0.1:8000/api/health
```

Optional extras:

```bash
npm run icons         # regenerate PNG/ICO brand assets with pure Python
npm run format        # prettier across src/
```

---

## Deployment

### Vercel (recommended, free)

```bash
npm i -g vercel
vercel            # first run links the project
vercel --prod     # every push after can auto-deploy from GitHub
```

`vercel.json` already wires both build outputs:

```json
{
  "builds": [
    { "src": "api/*.py", "use": "@vercel/python" },
    { "src": "package.json", "use": "@vercel/static-build" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/$1" },
    { "src": "/(.*)", "dest": "/$1" }
  ]
}
```

No environment variables are required. Remember the Vercel Hobby limits:

| Limit | Value | How the app copes |
|---|---|---|
| Function runtime | 10 s | `u2netp` default + client-side pre-downscale to 1600 px |
| Request body | 4.5 MB | `prepareForUpload()` re-encodes oversized images before upload |
| Model cold start | ~devtime | Weights cached in `/tmp`, session reused while the instance is warm |

### Any static host

Because the frontend is the whole app, the contents of `dist/` can be dropped on
Netlify, Cloudflare Pages, GitHub Pages or any object store. AI removal needs the
Python endpoints; point the frontend at them by changing `API_BASE` in
`src/services/api.ts`.

---

## Screenshots

> _Run `npm run dev`, then capture the views below and drop the PNGs into `docs/`._

| View | File | What to capture |
|---|---|---|
| **Landing / empty state** | `docs/01-landing.png` | The aerial-video hero with the condensed headline and drag-drop panel. |
| **Single comparison (side)** | `docs/02-compare-side.png` | Original vs cutout in the two-up grid with the size/time stats strip. |
| **Single comparison (slider)** | `docs/03-compare-slider.png` | The draggable before/after divider mid-sweep. |
| **AI panel** | `docs/04-ai-panel.png` | Model picker, max-edge slider, alpha matting expanded, API status dot. |
| **Adjust panel** | `docs/05-adjust-panel.png` | Brightness/contrast/saturation/hue/blur/sharpen + background + format + quality. |
| **Presets** | `docs/06-presets.png` | The five preset cards with their parameter chips. |
| **Batch queue** | `docs/07-batch.png` | Multi-file queue with mixed `done` / `pending` statuses. |
| **Export modal** | `docs/08-export.png` | Format/quality/scale/background controls and the checkerboard preview. |
| **Region erase** | `docs/08b-region-erase.png` | Rectangles drawn over leftover background in the Erase panel. |
| **Workspace canvas** | `docs/09-workspace.png` | Fabric.js canvas with the floating toolbar and zoom readout. |
| **Processing overlay** | `docs/10-processing.png` | Neural Scan with progress bar and cancel button. |
| **Light theme** | `docs/11-light.png` | The cream-paper light variant of any view. |
| **Settings / account** | `docs/12-settings.png` | Theme, language, sync export, clear data, about block. |

```
docs/
├── 01-landing.png
├── 02-compare-side.png
├── 03-compare-slider.png
├── 04-ai-panel.png
├── 05-adjust-panel.png
├── 06-presets.png
├── 07-batch.png
├── 08-export.png
├── 08b-region-erase.png
├── 09-workspace.png
├── 10-processing.png
├── 11-light.png
└── 12-settings.png
```

---

## Brand

- **Product:** Dannz AI Background & Image Studio (`Dannz AI Studio`)
- **Author:** Dannz
- **Wordmark:** Oswald ExtraBold, condensed uppercase, tight tracking
- **Accent:** `#D6523A` (signal red) · **Base:** `#0a0b0c` · **On-dark text:** `#F7F5EF`
- **Mono:** JetBrains Mono for every metric, status and label
- **Icons:** 38 hand-authored SVGs in `src/assets/icons/` — no emoji, no icon font
- **App icons:** `python scripts/generate_icons.py` rebuilds every PNG/ICO from `public/favicon.svg`

---

## Privacy

- No analytics, no trackers, no cookies, no third-party requests except Google Fonts and the hero video CDN.
- Uploaded images are held in memory and IndexedDB on the device. The only outbound
  transfer is the image you explicitly send to `/api/remove_bg`.
- Nothing is ever written to a database. "Accounts" are salted SHA-256 hashes stored locally.
- You can wipe everything from **Settings → Data → Clear local data**.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 18 + TypeScript 5 | Strict types catch pipeline mistakes at build time |
| Styling | Tailwind CSS 3 + design tokens | Themeable via CSS variables, no runtime cost |
| Build | Vite 5 | Fast dev server, predictable chunking |
| Canvas | Fabric.js 5 | Infinite pan/zoom, object layers, filter stack |
| ZIP | @zip.js/zip.js | Streaming, dependency-light |
| Storage | IndexedDB (hand-rolled) | No `idb` dependency, persists large blobs |
| API | Python `http.server` | Zero framework — runs on Vercel and `python api/server.py` alike |
| AI | rembg + onnxruntime | Open weights, CPU inference, no API keys |

---

<div align="center">

**Dannz AI Background & Image Studio** — built by Dannz.

</div>
