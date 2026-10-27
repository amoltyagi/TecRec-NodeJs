import { createHash } from 'crypto';

/**
 * Build a URL-safe slug from arbitrary text (brand names, model codes, AI
 * output). Previously only spaces were replaced, so model codes containing `/`,
 * `?`, `#` or non-ASCII characters produced broken routes, and two distinct
 * model numbers could collapse onto the same slug and crash the insert.
 */
export function toSlug(input: string, maxLength = 80): string {
  const normalized = input
    .normalize('NFKD')
    // Strip combining diacritics so "Café" and "Cafe" slug the same way.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const trimmed = normalized.slice(0, maxLength).replace(/-+$/g, '');
  return trimmed.length > 0 ? trimmed : 'product';
}

/** Short, stable hash suffix used to disambiguate otherwise identical slugs. */
export function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8);
}
