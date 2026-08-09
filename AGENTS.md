# TecRec Universal — Project Guide

> Tech product decoder. Enter a model code (or scan a product label) and get back
> identity, specs, release, market pricing, and alternatives — powered by Google
> Gemini with real-time Search grounding, persisted in Supabase.
>
> Source of truth / product spec: `tecrec_v2_master_prompt.md`

## Stack

- **Next.js 16** (App Router), **React 19**, **TypeScript 5**
- **Tailwind CSS 4** (via `@import "tailwindcss"` — no `tailwind.config.ts`)
- **Framer Motion 12** (spring physics), **lucide-react** icons
- **Supabase** (PostgreSQL): `products` + `search_history` tables (see `supabase-schema.sql`)
- **Google Gemini** (`@google/generative-ai`) for vision scan + decode

## Commands

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — eslint

## Environment variables (`.env.local`)

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` / `API_KEY` | Gemini API key (used by AI layer) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |

## Architecture / data flow

```
Client (scan text / camera image)
  └── /api/decode  (model string)   ─┐
  └── /api/scan    (base64 image)   ─┤
                                     ▼
                      Supabase lookup (cache product)
                          ├─ hit  → return, increment search_count
                          └─ miss → geminiDecode() → saveProduct() → return
```

Rate limit: **5 AI decodes per day per IP** (counted via `search_history`).

## Key files

| Path | Responsibility |
|------|----------------|
| `src/app/page.tsx` | Single-page UI: home → analyzing → result states |
| `src/app/layout.tsx` | Root layout, metadata, **viewport config** |
| `src/app/api/decode/route.ts` | Text decode: rate-limit → DB → Gemini → save |
| `src/app/api/scan/route.ts` | Camera decode: base64 validation → vision → decode |
| `src/lib/ai/gemini.ts` | Gemini client, scan/decode prompts, model fallback |
| `src/lib/db/supabase.ts` | Product CRUD, search logging, daily count |
| `src/types.ts` | Shared TS types (`DecodeResult`, `TechIdentity`, …) |
| `src/components/scanner/CameraView.tsx` | Camera modal (getUserMedia) |
| `src/components/results/*` | ProductIdentity, PriceMeter, AlternativeList |
| `src/components/ui/Toast.tsx` | Toast system + container |
| `src/context/ToastContext.tsx` | Toast provider/context |
| `supabase-schema.sql` | DB schema + `increment_search` RPC |

## Conventions

- **Font:** Plus Jakarta Sans (`--font-sans`)
- **Colors:** Emerald `#10b981`, aurora gradient (`#0f172a` → `#1e3a5f`)
- **Glassmorphism:** `.liquid-glass` + `.specular-highlight`
- **Animations:** spring `{ type: "spring", stiffness: 300, damping: 30, mass: 1 }`
- **Safe areas:** `.pt-safe` / `.pb-safe` / `.px-safe` / `.pl-safe` / `.pr-safe`
  (wrap `env(safe-area-inset-*)`) — use on any full-screen mobile surface.
- **Tailwind 4 note:** configure theme in `globals.css` via `@theme inline`, not a config file.

## Recent changes

### 2026-08-09 — Fluid edge-to-edge mobile layout (`ac2b08a`)
- **PWA/phone feel:** `layout.tsx` now exports a `viewport` config
  (`viewportFit: cover`, `userScalable: false`, `themeColor`).
- **Full-bleed on phones:** home & result cards stretch edge-to-edge
  (`max-w-none`, `flex-1`, `rounded-none`) and fill `100dvh`; desktop keeps the
  capped, rounded card via `sm:` variants.
- **Safe areas:** added safe-area utility classes in `globals.css`; applied to
  page container, camera modal, and toast placement.
- **Camera:** full-screen modal on mobile (video `flex-1`), keeps floating card
  on `sm:`+.
- **Permissions:** relaxed `opencode.jsonc` `ask` rules to `allow` for
  non-destructive tools (kept destructive `deny` rules).
