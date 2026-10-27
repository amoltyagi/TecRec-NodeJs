import { createHash, timingSafeEqual } from 'crypto';
import { isIP } from 'net';
import { cleanText, MAX_MODEL_LENGTH } from '@/lib/validation';

/**
 * Input-trust helpers shared by the API routes and the admin surface.
 *
 * Everything here treats the request as hostile: headers can be spoofed, bodies
 * can lie about their length, and "client IP" is only as trustworthy as the
 * platform that set it.
 */

export function sanitizeModelInput(input: unknown): string {
  return cleanText(input, MAX_MODEL_LENGTH);
}

/**
 * Expand an IPv6 address enough to take its /64 prefix, and unwrap IPv4-mapped
 * addresses. A single IPv6 host usually controls a whole /64, so keying quota on
 * the full address is trivially bypassable.
 */
function ipv6Prefix64(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];

  const [head = '', tail] = ip.split('::');
  const headParts = head ? head.split(':') : [];
  if (tail === undefined) {
    return headParts.slice(0, 4).join(':');
  }
  const tailParts = tail ? tail.split(':') : [];
  const fillCount = Math.max(0, 8 - headParts.length - tailParts.length);
  const expanded = [...headParts, ...Array.from({ length: fillCount }, () => '0'), ...tailParts];
  return expanded.slice(0, 4).join(':');
}

/** Canonical quota key for an IP: IPv4 as-is, IPv6 reduced to its /64. */
export function normalizeIpForQuota(ip: string): string {
  const trimmed = ip.trim().replace(/^\[|\]$/g, '').split('%')[0];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
  if (mapped) return mapped[1];
  if (isIP(trimmed) === 4) return trimmed;
  if (isIP(trimmed) === 6) return `${ipv6Prefix64(trimmed)}::/64`;
  return 'unknown';
}

/**
 * Client IP extraction.
 *
 * The Vercel platform header is only trusted when actually running on Vercel;
 * trusting it unconditionally would let any caller pick their own quota bucket
 * on a self-hosted deployment.
 */
export function getClientIp(request: Request): string {
  const candidates: string[] = [];

  if (process.env.VERCEL === '1') {
    const vercelForwarded = request.headers.get('x-vercel-forwarded-for');
    if (vercelForwarded) candidates.push(vercelForwarded);
  }
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) candidates.push(forwarded);
  const realIp = request.headers.get('x-real-ip');
  if (realIp) candidates.push(realIp);

  for (const candidate of candidates) {
    for (const part of candidate.split(',')) {
      const value = part.trim();
      if (isIP(value) !== 0) return normalizeIpForQuota(value);
    }
  }
  return 'unknown';
}

let warnedAboutMissingSalt = false;

/**
 * Hash the quota key. The salt is not a secret in the cryptographic sense (the
 * input space is small), but requiring one per deployment stops an attacker with
 * a database dump from precomputing every IPv4 address.
 */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT?.trim();
  if (!salt && process.env.NODE_ENV === 'production' && !warnedAboutMissingSalt) {
    warnedAboutMissingSalt = true;
    console.warn('IP_HASH_SALT is not set; quota keys use a fixed public salt. Set it in production.');
  }
  return createHash('sha256').update(`${salt || 'tecrec-default-salt'}:${ip}`).digest('hex');
}

/** Constant-time string comparison for the admin bearer token. */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) {
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

export function isJsonContentType(request: Request): boolean {
  const contentType = request.headers.get('content-type') ?? '';
  return contentType.split(';')[0].trim().toLowerCase() === 'application/json';
}

/**
 * Browser-originated cross-site POSTs are rejected. A JSON content-type check
 * already forces a CORS preflight cross-origin, but this closes the gap for
 * clients that omit or forge it.
 */
export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // server-to-server / curl
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }

  const allowedHosts = new Set<string>();
  const host = request.headers.get('host');
  if (host) allowedHosts.add(host.toLowerCase());
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    try {
      allowedHosts.add(new URL(siteUrl).host.toLowerCase());
    } catch {
      /* ignore malformed config; the host header check still applies */
    }
  }
  return allowedHosts.has(originHost);
}

export type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: number; error: string };

/**
 * Read and parse a JSON body with a hard byte cap that does not depend on
 * `Content-Length` (which a chunked request can omit or lie about).
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<BodyResult> {
  const declaredLength = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, status: 413, error: 'Request too large' };
  }

  if (!request.body) {
    return { ok: false, status: 400, error: 'Missing request body' };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413, error: 'Request too large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: 'Could not read request body' };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* reader may already be released after cancel */
    }
  }

  let text: string;
  try {
    text = new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
  } catch {
    return { ok: false, status: 400, error: 'Invalid request encoding' };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON body' };
  }
}

/** Seconds until 00:00 UTC, for the quota `Retry-After` header. */
export function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
}
