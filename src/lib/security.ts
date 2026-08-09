import { createHash } from 'crypto';
import { NextRequest } from 'next/server';

export const MAX_MODEL_LENGTH = 200;

/** Trim, cap length, strip control characters. Applied to BOTH typed queries and AI-extracted scan results. */
export function sanitizeModelInput(input: string): string {
  return input
    .trim()
    .slice(0, MAX_MODEL_LENGTH)
    .replace(/[\x00-\x1F\x7F]/g, '');
}

/**
 * Trusted client-IP extraction.
 * On Vercel, `x-vercel-forwarded-for` is set by the platform edge and cannot be
 * spoofed by the client. Elsewhere we fall back to the first entry of
 * `x-forwarded-for` (client-controlled off-Vercel — accepted residual risk for
 * a per-IP free quota).
 */
export function getClientIp(req: NextRequest): string {
  const vercel = req.headers.get('x-vercel-forwarded-for');
  if (vercel) return vercel.split(',')[0].trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

/**
 * SHA-256 (optionally salted via IP_HASH_SALT) instead of the old 32-bit hash:
 * collisions previously let unrelated users share each other's daily quota.
 */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || 'tecrec';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

/**
 * Reject oversized request bodies BEFORE parsing JSON. Route handlers have no
 * built-in body limit; Vercel caps at 4.5MB platform-side, this is the
 * app-level layer. Note: chunked requests may lack Content-Length — those fall
 * through to post-parse validation (base64 size check / input sanitizer).
 */
export function isBodyTooLarge(req: NextRequest, maxBytes: number): boolean {
  const len = Number(req.headers.get('content-length') || 0);
  return Number.isFinite(len) && len > maxBytes;
}
