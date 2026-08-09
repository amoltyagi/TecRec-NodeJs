# TecRec Universal — Project Guide

> Tech product decoder. Enter a model code (or scan a product label) and get back
> identity, specs, release, market pricing, and alternatives — powered by Venice AI
> (web-search-grounded decode + vision scan), persisted in Neon Postgres.
>
> Source of truth / product spec: `tecrec_v2_master_prompt.md`
> (note: master prompt still references Gemini/Supabase — the stack below is current)

## Stack

- **Next.js 16** (App Router), **React 19**, **TypeScript 5**
- **Tailwind CSS 4** (via `@import "tailwindcss"` — no `tailwind.config.ts`)
- **Framer Motion 12** (spring physics), **lucide-react** icons
- **Neon** (serverless Postgres via `@neondatabase/serverless`):
  `products` + `search_history` tables (see `neon-schema.sql`)
- **Venice AI** (OpenAI-compatible, plain `fetch` — no SDK) for vision scan + decode,
  with real-time web search via `venice_parameters.enable_web_search`

## Commands

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — eslint

## Environment variables (`.env.local`, see `.env.example`)

| Variable | Purpose |
|----------|---------|
| `VENICE_API_KEY` | Venice AI key (decode + scan) |
| `VENICE_DECODE_MODEL` | Optional override, default `zai-org-glm-4.7` |
| `VENICE_SCAN_MODEL` | Optional override, default `qwen3-vl-235b-a22b` |
| `DATABASE_URL` | Neon pooled Postgres connection string |

## Architecture / data flow

```
Client (scan text / camera image)
  └── /api/decode  (model string)   ─┐
  └── /api/scan    (base64 image)   ─┤
                                     ▼
                      Neon lookup (cache product)
                          ├─ hit  → return, increment search_count (free, not rate-limited)
                          └─ miss → veniceDecode() → saveProduct() → logSearch() → return
```

Rate limit: **5 AI decodes per day per IP** (counted via `search_history`,
which only logs actual AI calls — cache hits don't consume the limit).

## Key files

| Path | Responsibility |
|------|----------------|
| `src/app/page.tsx` | Single-page UI: home → analyzing → result states |
| `src/app/layout.tsx` | Root layout, metadata, **viewport config** |
| `src/app/api/decode/route.ts` | Text decode: rate-limit → DB → Venice → save |
| `src/app/api/scan/route.ts` | Camera decode: base64 validation → vision → decode |
| `src/lib/ai/venice.ts` | Venice client, scan/decode prompts, model fallback chains |
| `src/lib/db/neon.ts` | Product CRUD, search logging, daily count |
| `src/types.ts` | Shared TS types (`DecodeResult`, `TechIdentity`, …) |
| `src/components/scanner/CameraView.tsx` | Camera modal (getUserMedia) |
| `src/components/results/*` | ProductIdentity, PriceMeter, AlternativeList |
| `src/components/ui/Toast.tsx` | Toast system + container |
| `src/context/ToastContext.tsx` | Toast provider/context |
| `neon-schema.sql` | DB schema (run in Neon SQL editor) |

## Conventions

- **Font:** Plus Jakarta Sans (`--font-sans`)
- **Colors:** Emerald `#10b981`, aurora gradient (`#0f172a` → `#1e3a5f`)
- **Glassmorphism:** `.liquid-glass` + `.specular-highlight`
- **Animations:** spring `{ type: "spring", stiffness: 300, damping: 30, mass: 1 }`
- **Safe areas:** `.pt-safe` / `.pb-safe` / `.px-safe` / `.pl-safe` / `.pr-safe`
  (wrap `env(safe-area-inset-*)`) — use on any full-screen mobile surface.
- **Tailwind 4 note:** configure theme in `globals.css` via `@theme inline`, not a config file.

## Recent changes

### 2026-08-09 — Venice AI + Neon migration & desktop layout
- **AI:** Gemini removed; `src/lib/ai/venice.ts` calls Venice chat completions via
  plain `fetch` (OpenAI-compatible). Decode: `zai-org-glm-4.7` w/
  `venice_parameters.enable_web_search: "on"` + `response_format: json_object`
  (web search costs $0.01/request). Scan: `qwen3-vl-235b-a22b` (default_vision)
  with base64 `image_url`. Fallbacks: `google-gemma-4-31b-it`.
- **DB:** Supabase removed; `src/lib/db/neon.ts` uses `@neondatabase/serverless`
  (env `DATABASE_URL`, schema in `neon-schema.sql`). `saveProduct` is an atomic
  `INSERT ... ON CONFLICT (model_number) DO UPDATE`; `increment_search` RPC
  replaced by a plain `UPDATE`.
- **Rate-limit fix:** cache hits no longer consume the 5/day limit
  (`logSearch` only runs on real AI calls).
- **UI:** desktop result view is now a 2-column grid (`lg:max-w-5xl`, identity+price
  left, alternatives right); home card `sm:max-w-2xl`; tiny hardcoded font sizes
  scale up on `sm:`+; all page states share one full-height mobile shell.

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
