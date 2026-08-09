import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Pragmatic CSP: Next.js injects inline bootstrap scripts, so 'unsafe-inline'
// for script-src is unavoidable without nonce middleware (future step).
// Dev tooling additionally needs eval (React Refresh) and websockets (HMR).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Ignored over plain HTTP (localhost dev); Vercel serves HTTPS in prod.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // camera is required for the scanner (self only); everything else denied.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
