/**
 * Central environment access.
 *
 * Every `process.env` read for runtime configuration goes through this module so
 * that misconfiguration produces one clear, actionable error instead of a
 * confusing failure deep inside a request. Values are read lazily: builds do not
 * need secrets, only a running server does.
 */

const DEFAULT_DECODE_MODEL = 'zai-org-glm-4.7';
const DEFAULT_DECODE_FALLBACKS = ['qwen3-vl-235b-a22b', 'google-gemma-4-31b-it'];
const DEFAULT_SCAN_MODEL = 'qwen3-vl-235b-a22b';
const DEFAULT_SCAN_FALLBACKS = ['google-gemma-4-31b-it'];
const DEFAULT_TIMEOUT_MS = 25_000;
const MIN_TIMEOUT_MS = 3_000;
const MAX_TIMEOUT_MS = 60_000;
const LOCAL_SITE_URL = 'http://localhost:3000';

/** Read a trimmed, non-empty environment value. */
function read(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function requireEnv(name: string, hint?: string): string {
  const value = read(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}${hint ? ` (${hint})` : ''}`);
  }
  return value;
}

export function getDatabaseUrl(): string {
  return requireEnv('DATABASE_URL', 'Postgres connection string');
}

export interface AiConfig {
  apiKey: string;
  apiUrl: string;
  decodeModels: string[];
  scanModels: string[];
  /** Provider-specific request fields merged into the chat-completions body. */
  extraBody: Record<string, unknown>;
  timeoutMs: number;
}

function splitList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueModels(models: string[]): string[] {
  return [...new Set(models.filter(Boolean))];
}

function readExtraBody(): Record<string, unknown> {
  const raw = read('AI_EXTRA_BODY_JSON');
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    console.error('AI_EXTRA_BODY_JSON must be a JSON object; ignoring it.');
  } catch {
    console.error('AI_EXTRA_BODY_JSON is not valid JSON; ignoring it.');
  }
  return {};
}

function readTimeout(): number {
  const raw = read('AI_TIMEOUT_MS');
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, parsed));
}

/** AI provider settings. Read lazily so that `next build` needs no secrets. */
export function getAiConfig(): AiConfig {
  const decodePrimary = read('AI_DECODE_MODEL') ?? DEFAULT_DECODE_MODEL;
  const scanPrimary = read('AI_SCAN_MODEL') ?? DEFAULT_SCAN_MODEL;
  return {
    apiKey: requireEnv('AI_API_KEY', 'credential for the chat-completions provider'),
    apiUrl: requireEnv('AI_API_URL', 'full chat-completions endpoint URL'),
    decodeModels: uniqueModels([
      decodePrimary,
      ...DEFAULT_DECODE_FALLBACKS,
      ...splitList(read('AI_DECODE_FALLBACKS')),
    ]),
    scanModels: uniqueModels([
      scanPrimary,
      ...DEFAULT_SCAN_FALLBACKS,
      ...splitList(read('AI_SCAN_FALLBACKS')),
    ]),
    extraBody: readExtraBody(),
    timeoutMs: readTimeout(),
  };
}

/** Returns the admin token, or null when the admin surface is disabled. */
export function getAdminToken(): string | null {
  return read('ADMIN_TOKEN') ?? null;
}

function readPositiveInt(name: string, fallback: number, max: number): number {
  const raw = read(name);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

/** Paid AI calls allowed per IP per UTC day. */
export function getIpDailyLimit(): number {
  return readPositiveInt('AI_DAILY_LIMIT_PER_IP', 5, 10_000);
}

/**
 * Global paid AI calls per UTC day. This is the only control that bounds total
 * spend; per-IP limits are trivially multiplied by IP rotation.
 */
export function getGlobalDailyLimit(): number {
  return readPositiveInt('AI_GLOBAL_DAILY_LIMIT', 500, 1_000_000);
}

/**
 * Canonical public origin, used for canonical tags, sitemap and robots.
 *
 * Deliberately fails loudly on a Vercel production build instead of silently
 * shipping `http://localhost:3000` URLs to search engines - that failure mode is
 * invisible in the UI but quietly de-indexes every page.
 */
export function getSiteUrl(): string {
  const configured = read('NEXT_PUBLIC_SITE_URL');
  if (configured) return configured.replace(/\/+$/, '');

  if (read('VERCEL_ENV') === 'production') {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL must be set for production deployments: it is used for canonical URLs, the sitemap and robots.txt.',
    );
  }

  const vercelUrl = read('VERCEL_URL');
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, '')}`;

  return LOCAL_SITE_URL;
}

export function isVercelProduction(): boolean {
  return read('VERCEL_ENV') === 'production';
}
