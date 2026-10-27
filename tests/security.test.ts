import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  constantTimeEquals,
  getClientIp,
  hashIp,
  isAllowedOrigin,
  isJsonContentType,
  normalizeIpForQuota,
  readJsonBody,
  sanitizeModelInput,
  secondsUntilUtcMidnight,
} from '@/lib/security';

/** Minimal request stand-in: these helpers only read headers. */
function fakeRequest(headers: Record<string, string>): Request {
  return { headers: new Headers(headers) } as unknown as Request;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sanitizeModelInput', () => {
  it('trims, collapses and caps', () => {
    expect(sanitizeModelInput('  rtx   5090  ')).toBe('rtx 5090');
    expect(sanitizeModelInput('x'.repeat(500))).toHaveLength(200);
  });

  it('rejects non-strings', () => {
    expect(sanitizeModelInput(undefined)).toBe('');
    expect(sanitizeModelInput({ model: 'x' })).toBe('');
  });
});

describe('normalizeIpForQuota', () => {
  it('keeps IPv4 addresses', () => {
    expect(normalizeIpForQuota('203.0.113.5')).toBe('203.0.113.5');
    expect(normalizeIpForQuota('[203.0.113.5]')).toBe('203.0.113.5');
  });

  it('collapses IPv6 to its /64 so rotation inside a subnet does not reset quota', () => {
    expect(normalizeIpForQuota('2001:db8:1234:5678:9abc:def0:1234:5678')).toBe('2001:db8:1234:5678::/64');
    expect(normalizeIpForQuota('2001:db8:1234:5678::1')).toBe('2001:db8:1234:5678::/64');
  });

  it('unwraps IPv4-mapped IPv6', () => {
    expect(normalizeIpForQuota('::ffff:192.0.2.7')).toBe('192.0.2.7');
  });

  it('falls back to unknown for garbage', () => {
    expect(normalizeIpForQuota('definitely-not-an-ip')).toBe('unknown');
  });
});

describe('getClientIp', () => {
  it('ignores a spoofed platform header when not running on Vercel', () => {
    vi.stubEnv('VERCEL', '');
    const request = fakeRequest({ 'x-vercel-forwarded-for': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' });
    expect(getClientIp(request)).toBe('5.6.7.8');
  });

  it('trusts the platform header on Vercel', () => {
    vi.stubEnv('VERCEL', '1');
    const request = fakeRequest({ 'x-vercel-forwarded-for': '1.2.3.4, 10.0.0.1' });
    expect(getClientIp(request)).toBe('1.2.3.4');
  });

  it('skips malformed entries rather than hashing junk', () => {
    const request = fakeRequest({ 'x-forwarded-for': 'not-an-ip, 9.9.9.9' });
    expect(getClientIp(request)).toBe('9.9.9.9');
  });

  it('returns unknown with no usable header', () => {
    expect(getClientIp(fakeRequest({}))).toBe('unknown');
  });
});

describe('hashIp', () => {
  it('is deterministic and salt-dependent', () => {
    vi.stubEnv('IP_HASH_SALT', 'salt-a');
    const first = hashIp('203.0.113.5');
    expect(hashIp('203.0.113.5')).toBe(first);
    expect(first).toHaveLength(64);

    vi.stubEnv('IP_HASH_SALT', 'salt-b');
    expect(hashIp('203.0.113.5')).not.toBe(first);
  });
});

describe('constantTimeEquals', () => {
  it('compares strings', () => {
    expect(constantTimeEquals('token', 'token')).toBe(true);
    expect(constantTimeEquals('token', 'tokeN')).toBe(false);
    expect(constantTimeEquals('token', 'token-longer')).toBe(false);
    expect(constantTimeEquals('', '')).toBe(true);
  });
});

describe('isJsonContentType', () => {
  it('accepts json with parameters', () => {
    expect(isJsonContentType(fakeRequest({ 'content-type': 'application/json' }))).toBe(true);
    expect(isJsonContentType(fakeRequest({ 'content-type': 'application/json; charset=utf-8' }))).toBe(true);
  });

  it('rejects other content types (blocks cross-site simple POSTs)', () => {
    expect(isJsonContentType(fakeRequest({ 'content-type': 'text/plain' }))).toBe(false);
    expect(isJsonContentType(fakeRequest({}))).toBe(false);
  });
});

describe('isAllowedOrigin', () => {
  it('allows same-host origins', () => {
    expect(isAllowedOrigin(fakeRequest({ origin: 'https://app.test', host: 'app.test' }))).toBe(true);
  });

  it('rejects cross-host origins', () => {
    expect(isAllowedOrigin(fakeRequest({ origin: 'https://evil.test', host: 'app.test' }))).toBe(false);
    expect(isAllowedOrigin(fakeRequest({ origin: 'not a url', host: 'app.test' }))).toBe(false);
  });

  it('allows requests without an Origin header (server-to-server)', () => {
    expect(isAllowedOrigin(fakeRequest({ host: 'app.test' }))).toBe(true);
  });
});

describe('readJsonBody', () => {
  const post = (body: string | ReadableStream<Uint8Array>, headers: Record<string, string> = {}) =>
    new Request('https://app.test/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
      ...(typeof body === 'string' ? {} : { duplex: 'half' }),
    } as RequestInit);

  it('parses JSON', async () => {
    const result = await readJsonBody(post('{"model":"RTX 5090"}'), 1024);
    expect(result).toEqual({ ok: true, value: { model: 'RTX 5090' } });
  });

  it('rejects malformed JSON with 400', async () => {
    const result = await readJsonBody(post('{not json'), 1024);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects oversized bodies declared via content-length', async () => {
    const result = await readJsonBody(post('{}', { 'content-length': '99999' }), 1024);
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  it('rejects oversized streamed bodies that lie about content-length', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`{"a":"${'x'.repeat(4096)}"}`));
        controller.close();
      },
    });
    const result = await readJsonBody(post(stream), 1024);
    expect(result).toMatchObject({ ok: false, status: 413 });
  });
});

describe('secondsUntilUtcMidnight', () => {
  it('is between 1 second and 24 hours', () => {
    const seconds = secondsUntilUtcMidnight();
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(24 * 60 * 60);
  });
});
