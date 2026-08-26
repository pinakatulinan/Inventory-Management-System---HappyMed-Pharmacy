import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * `script-src` still allows 'unsafe-inline' because Next injects an inline
 * bootstrap script and hydration payload on every page; locking that down
 * properly needs per-request nonces plumbed through the proxy. Even so, this
 * policy is worth having: it blocks scripts from any other origin, stops the
 * app being framed, and prevents form posts to third-party hosts - which are
 * the attacks that actually matter for a staff-only tool behind a login.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    // Only meaningful over HTTPS; ignored by browsers on plain HTTP, so it is
    // safe to send in development too.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    // Enables forbidden() / unauthorized(), so an authorisation failure renders
    // a real 403 page instead of a generic 500 error boundary.
    authInterrupts: true,
  },

  // Staff tool holding patient-adjacent data: never let it be indexed or framed.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
