import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

  /**
   * BUNDLE OPTIMIZATION: Help the bundler tree-shake barrel exports.
   * WHY: Large barrel files (like builder-v1.2/_lib/index.ts) re-export hundreds
   * of items. Without this, importing one function pulls the entire barrel.
   * This tells Next.js to transform barrel imports into direct file imports.
   */
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@tanstack/react-table',
    ],
  },

  // Source maps disabled in production to prevent exposing source code
  productionBrowserSourceMaps: false,

  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  /**
   * Standalone output for Docker deployment.
   * WHY: Creates a minimal production build that includes only necessary files.
   * This reduces the Docker image size and improves deployment speed.
   */
  output: 'standalone',

  /**
   * Image optimization configuration for Next.js Image component.
   *
   * WHY: The website builder allows users to add images from any URL.
   * We need to configure Next.js to optimize and cache these images.
   *
   * REMOTE PATTERNS:
   * - Allow HTTPS images from any domain (users can use any image hosting)
   * - This enables Next.js Image optimization (caching, resizing, WebP conversion)
   */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },

  /**
   * PWA Service Worker Headers
   *
   * WHY: Service workers must NEVER be cached by the browser's HTTP cache.
   *      The browser has its own 24-hour update check for registered service workers,
   *      but a stale HTTP cache can interfere with this mechanism.
   *
   * HEADERS:
   * - Cache-Control: no-cache — forces revalidation on every request
   * - Content-Type: application/javascript — ensures CDNs/proxies serve it correctly.
   *   Without this, some reverse proxies (Coolify, nginx) may serve sw.js with
   *   the wrong MIME type, causing the browser to reject it silently.
   * - Service-Worker-Allowed: / — explicitly allows the SW to control the entire origin
   *
   * (Per official Next.js PWA docs: https://nextjs.org/docs/app/guides/progressive-web-apps)
   */
  async headers() {
    return [
      /**
       * GLOBAL SECURITY HEADERS
       *
       * WHY: Defense-in-depth headers applied to every route.
       * - X-Content-Type-Options: prevents MIME-type sniffing attacks
       * - X-Frame-Options: prevents clickjacking by blocking iframe embedding
       * - Referrer-Policy: limits referrer info leaked to third-party origins
       *
       * NOTE: HSTS is intentionally omitted — it should be set by the
       * reverse proxy / CDN (Coolify, Cloudflare, etc.) to avoid issues
       * during local development and staging.
       */
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ]
  },
};

export default nextConfig;
