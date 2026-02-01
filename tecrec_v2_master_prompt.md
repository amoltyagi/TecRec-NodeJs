# Master Context: TecRec v2

> **Instructions for the AI:** 
> You are an expert Full Stack Engineer and Systems Architect specializing in Next.js, AI integration, and Mobile-First design. 
>
> I am starting a new project called **TecRec v2**. Please adopt the following specification as the **absolute source of truth** for this project. 
>
> Do not assume any legacy code exists. We are building from scratch. 
>
> Your goal is to initialize the project, set up the architecture as defined below, and begin implementing the MVP features.

---

# TecRec v2: Project Specification

> **Goal:** Build a lean, production-ready tech product decoder with web-first deployment, future native apps, backend persistence, and SEO-driven discovery.

## 1. Platform Strategy

### Phase 1: Web App (PWA)
Deploy as a **Progressive Web App** on Vercel with custom domain.
- Installable on mobile home screens
- Works offline for cached products
- Single codebase serves all screen sizes

### Phase 2: Native Apps (iOS/Android)
Use **Capacitor** to wrap the web app into native shells.
- Reuses 95% of the web codebase
- Native camera access via Capacitor plugins
- Publish to App Store & Google Play

**Decision:** Use Capacitor for code reuse and faster time-to-market.

## 2. Tech Stack

### Frontend
- **Next.js 15 (App Router)**: Framework, SSR, API routes
- **React 19**: UI library
- **TypeScript 5.x**: Type safety
- **Tailwind CSS 4.x**: Styling (Purged, lean)
- **Framer Motion 12.x**: Animations (Spring physics)

### Backend / Database
- **Supabase**: PostgreSQL + Auth + Realtime
- **Vercel KV (Redis)**: Caching layer (TTL: 7 days)

### AI Layer
- **Primary:** Google Gemini 2.0 Flash (`gemini-2.0-flash`) with Google Search grounding.
- **Fallback:** OpenAI `gpt-4o-mini` + Tavily.

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (React)                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Scanner │  │ Search  │  │ Results │  │ History │            │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘            │
│       │            │            │            │                  │
│       └────────────┴─────┬──────┴────────────┘                  │
│                          ▼                                      │
│                    [ API Client ]                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────────┐
│                      NEXT.JS API ROUTES                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ /api/scan    │  │ /api/decode  │  │ /api/product │          │
│  │ (Vision AI)  │  │ (AI Decode)  │  │ (CRUD + SEO) │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         ▼                 ▼                 ▼                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   SERVICE LAYER                          │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐ │   │
│  │  │ Gemini  │  │ OpenAI  │  │ Tavily  │  │ Supabase DB │ │   │
│  │  │ (Primary)│  │(Fallback)│  │ (Search)│  │ (Storage)   │ │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ▲                                  │
│                              │                                  │
│                      ┌───────┴───────┐                          │
│                      │  Vercel KV    │                          │
│                      │  (Cache)      │                          │
│                      └───────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

## 4. Data Models (Supabase)

```typescript
// Product Table
interface Product {
  id: string;                // UUID
  modelNumber: string;       // "WGG24401GB" (indexed, unique)
  slug: string;              // "bosch-wgg24401gb" (for SEO URLs)
  brand: string;
  category: string;
  releaseWindow: string;     // "Q3 2024"
  keySpecs: string[];
  insight: string;
  priceIndicator: {
    level: string;           // "Mid-Range"
    percent: number;         // 55
    estimatedPrice: string;  // "$1,050"
  };
  amazonLink: string;
  alternatives: Alternative[];
  searchCount: number;       // Analytics
  createdAt: Date;
  updatedAt: Date;
}

// SearchHistory Table
interface SearchHistory {
  id: string;
  query: string;
  productId: string | null;  // FK to Product
  source: 'camera' | 'text';
  ipHash: string;            // Anonymized
  createdAt: Date;
}
```

## 5. API Routes

| Route | Method | Purpose | Caching |
|-------|--------|---------|---------|
| `/api/scan` | POST | Extract model from image | No |
| `/api/decode` | POST | Decode model via AI | 7-day KV cache |
| `/api/product/[slug]` | GET | Fetch cached product (SEO) | CDN cache |
| `/api/product` | POST | Save new product to DB | No |

## 6. Feature Specifications

### 6.1 Camera Scanner
- **Input:** Base64 JPEG
- **AI Model:** Gemini 2.0 Flash (Vision)
- **Output:** Extracted model number string
- **Error Handling:** Retry 2x -> Manual prompt

### 6.2 Manual Text Search
- **Flow:** Check DB -> If missing, call AI Decode -> Save DB -> Return

### 6.3 AI Decode
- **Output JSON Schema:**
  ```json
  {
    "identity": {
      "brand": "Bosch",
      "category": "Washing Machine",
      "releaseWindow": "Q3 2024",
      "keySpecs": ["9kg capacity", "1400 RPM", "EcoSilence Drive"],
      "insight": "Mid-range front-loader with excellent energy efficiency.",
      "amazonLink": "https://amazon.com/s?k=Bosch+WGG24401GB?tag=tecrec-20",
      "priceIndicator": { "level": "Mid-Range", "percent": 55, "estimatedPrice": "$1,050" }
    },
    "alternatives": [
      { "brand": "Samsung", "model": "WW90T554DAW", "why": "Similar specs, lower price" }
    ]
  }
  ```

### 6.4 Price Meter Logic
- 0-25%: Value
- 26-50%: Mid-Range
- 51-75%: Premium
- 76-100%: Elite

---

## 7. Styling Guidelines

- **Font:** Plus Jakarta Sans
- **Colors:** Emerald (`#10b981`), Aurora Gradient (`#0f172a` -> `#1e3a5f`)
- **Glassmorphism:** `bg-white/5` + `backdrop-blur-lg`
- **Animations:** Spring physics (Stiffness 300, Damping 30)

---

## 8. Development Decisions

| Topic | Decision |
|-------|----------|
| **Authentication** | Not in Phase 1. Phase 2 will add Google & Apple Sign-In via Supabase Auth. |
| **Analytics Dashboard** | Yes. Build admin view showing most-searched products, search volume trends. |
| **Monetization** | Yes. Amazon links will include affiliate tracking tag (e.g., `?tag=tecrec-20`). |
| **Rate Limiting** | 5 free AI decodes per day per IP (tracked via Vercel KV). |

---

## 9. File Structure

```
tecrec-v2/
├── src/
│   ├── app/
│   │   ├── (routes)/
│   │   │   ├── page.tsx              
│   │   │   └── product/[slug]/page.tsx
│   │   ├── api/
│   │   │   ├── decode/route.ts
│   │   │   ├── scan/route.ts
│   │   │   └── product/route.ts
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── scanner/CameraView.tsx
│   │   └── results/ProductIdentity.tsx
│   ├── lib/
│   │   ├── ai/gemini.ts
│   │   ├── db/supabase.ts
│   │   └── cache/kv.ts
│   └── types/index.ts
├── public/
├── .env.local
└── tailwind.config.ts
```
