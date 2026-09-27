import type { NextConfig } from 'next';

/**
 * Static security headers apply to every response, including static assets. The CSP is
 * per-request (nonce) and is set in src/proxy.ts.
 */
const hstsMaxAge = Number(process.env['WAYLORN_HSTS_MAX_AGE'] ?? 63_072_000);

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), interest-cohort=()',
  },
  ...(hstsMaxAge > 0
    ? [{ key: 'Strict-Transport-Security', value: `max-age=${hstsMaxAge}; includeSubDomains${process.env['WAYLORN_HSTS_PRELOAD'] === 'true' ? '; preload' : ''}` }]
    : []),
];

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  agentRules: false,
  devIndicators: false,
  transpilePackages: ['@waylorn/contracts', '@waylorn/domain', '@waylorn/design-tokens'],
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

export default config;
