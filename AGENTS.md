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
| `IP_HASH_SALT` | Optional salt for rate-limit IP hashes |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin (sitemap, robots, OG, canonical tags) |

## Architecture / data flow

```
Client (scan text / camera image)
  └── /api/decode  (model string)   ─┐
  └── /api/scan    (base64 image)   ─┤
                                     ▼
                      Neon lookup (cache product)
                          ├─ hit  → return, increment search_count (free, not rate-limited)
                          └─ miss → veniceDecode() → saveProduct() → logSearch() → return

SEO: /product/[slug] — ISR (24h revalidate), server-rendered from Neon cache,
     JSON-LD Product schema, canonical URLs. /sitemap.xml (top 1000 by
     search_count) + /robots.txt auto-generated. Alternatives on product pages
     link to /?q=BRAND+MODEL which auto-decodes on the home page.
     Requires NEXT_PUBLIC_SITE_URL for absolute URLs.
```

Rate limit: **5 AI decodes per day per IP** (counted via `search_history`,
which only logs actual AI calls — cache hits don't consume the limit).

## Security

- **`src/lib/security.ts`** — shared: `sanitizeModelInput` (200-char cap + control-char
  strip; applied to typed queries AND untrusted vision-model output), `getClientIp`
  (trusted `x-vercel-forwarded-for` first, `x-forwarded-for` fallback),
  `hashIp` (SHA-256 + optional `IP_HASH_SALT`), `isBodyTooLarge` (pre-JSON-parse
  `Content-Length` guard: 8KB decode / 7MB scan).
- **Error handling:** upstream AI/DB error details are logged server-side only;
  clients always get generic messages (no internal leakage).
- **Headers** (`next.config.ts`): CSP (`default-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'none'`; `unsafe-inline` scripts required by Next inline
  bootstrap — nonce-based CSP is a future step), `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS (prod), and
  `Permissions-Policy` with `camera=(self)` for the scanner.
- **Accepted risks (documented, not fixed):** rate-limit check-then-log race
  (concurrent requests can exceed 5/day slightly; bounded impact); IP-based
  limiting is inherently bypassable via IP rotation; off-Vercel the client IP
  header is client-controlled.


## Key files

| Path | Responsibility |
|------|----------------|
| `src/app/page.tsx` | Single-page UI: home → analyzing → result states (`/?q=` deep link) |
| `src/app/product/[slug]/page.tsx` | ISR SEO page per cached product + JSON-LD |
| `src/app/sitemap.ts` / `robots.ts` | Sitemap from Neon slugs, robots directives |
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

### 2026-08-13 — SEO product pages
- `/product/[slug]`: server-rendered ISR pages (24h revalidate) built from the
  Neon product cache — H1 brand+model, reused `ProductIdentity`/`PriceMeter`
  client islands, alternatives as crawlable links to `/?q=...`, JSON-LD
  `Product` schema (with `Offer` when price parses), canonical + OG metadata,
  proper 404 status for unknown slugs, AI-accuracy disclaimer.
- `/sitemap.xml` (top 1000 products by search_count) and `/robots.txt`;
  `metadataBase` + new optional env `NEXT_PUBLIC_SITE_URL`.
- Home page auto-decodes `/?q=MODEL` deep links (query param consumed + URL cleaned).

### 2026-08-09 — Security hardening pass
- New `src/lib/security.ts`: shared input sanitizer (now also applied to
  vision-model scan output), trusted client-IP extraction, SHA-256 IP hashing
  (replaces colliding 32-bit hash), pre-parse body-size guards.
- Error leakage fixed: upstream AI error details no longer returned to clients.
- Security headers in `next.config.ts` (CSP, nosniff, DENY framing, HSTS,
  Referrer-Policy, Permissions-Policy with `camera=(self)`).
- AI-provided `amazonLink` only opened when `https:` (+ `noopener,noreferrer`).
- `next` 16.1.1 → 16.3.0 (+ `eslint-config-next`): fixes all npm-audit highs.
  `npm audit` clean.

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
