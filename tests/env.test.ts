import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSiteUrl } from '@/lib/env';

/**
 * `getSiteUrl` decides what every canonical tag, the sitemap and robots.txt
 * point at, so its resolution order matters more than it looks.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

const clearEnv = () => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
  vi.stubEnv('VERCEL_URL', '');
  vi.stubEnv('VERCEL_ENV', '');
};

describe('getSiteUrl', () => {
  it('prefers explicit configuration and strips trailing slashes', () => {
    clearEnv();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://tecrec.example.com///');
    expect(getSiteUrl()).toBe('https://tecrec.example.com');
  });

  it('explicit configuration wins over platform hints', () => {
    clearEnv();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://custom.example.com');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'tecrec.vercel.app');
    expect(getSiteUrl()).toBe('https://custom.example.com');
  });

  it('derives the production domain from the platform on a production build', () => {
    clearEnv();
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'tec-rec-node-js.vercel.app');
    expect(getSiteUrl()).toBe('https://tec-rec-node-js.vercel.app');
  });

  it('accepts a platform value that already includes a scheme', () => {
    clearEnv();
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'https://tec-rec-node-js.vercel.app');
    expect(getSiteUrl()).toBe('https://tec-rec-node-js.vercel.app');
  });

  it('falls back to the deployment URL on previews without a production domain', () => {
    clearEnv();
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', 'tec-rec-node-abc123.vercel.app');
    expect(getSiteUrl()).toBe('https://tec-rec-node-abc123.vercel.app');
  });

  it('uses localhost for local builds', () => {
    clearEnv();
    expect(getSiteUrl()).toBe('http://localhost:3000');
  });

  it('still refuses to ship localhost on a production build with no origin at all', () => {
    clearEnv();
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(() => getSiteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL must be set/);
  });
});
