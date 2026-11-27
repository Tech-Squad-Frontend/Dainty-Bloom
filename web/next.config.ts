import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import { getApiOrigin } from './src/lib/apiUrl';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${getApiOrigin()}/api/:path*`,
      },
    ];
  },
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production';
    const scriptSources = isProduction
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "frame-src 'self' https://checkout.stripe.com https://js.stripe.com",
      "form-action 'self' https://checkout.stripe.com",
      "connect-src 'self'",
      "img-src 'self' data: blob: https://res.cloudinary.com",
      "font-src 'self' data:",
      "media-src 'self' https://res.cloudinary.com",
      scriptSources,
      "style-src 'self' 'unsafe-inline'",
      "worker-src 'self' blob:",
      'upgrade-insecure-requests',
    ].join('; ');
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: isProduction
              ? 'Content-Security-Policy'
              : 'Content-Security-Policy-Report-Only',
            value: csp,
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), browsing-topics=()',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
          ...(isProduction
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains',
                },
              ]
            : []),
        ],
      },
    ];
  },
  turbopack: {
    root: projectRoot,
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
