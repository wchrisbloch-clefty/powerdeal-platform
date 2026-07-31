import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Server-only packages that must not be bundled into the client graph.
  // lib/prompts/system.ts reads the brain at runtime via fs. Next's tracer
  // can't see a dynamic join(process.cwd(), ...), so include it explicitly —
  // otherwise every domain task 500s on Vercel with ENOENT.
  outputFileTracingIncludes: {
    '/api/**/*': ['./prompts/**/*'],
    '/app/**/*': ['./prompts/**/*'],
    /**
     * @sparticuz/chromium resolves its brotli payload at RUNTIME, so Next's
     * static tracer does not see it: without this line the function deploys
     * clean at 3.7 MB and then throws on the first PDF request, which is the
     * worst possible failure shape — a green build and a broken button.
     *
     * Measured 2026-07-31 with the binary forced in: 70.1 MB traced against
     * Vercel's 250 MB uncompressed limit, so the standard pattern fits with
     * room to spare. Kept here so the PDF route can be wired up without
     * re-deriving that.
     */
    '/api/forge': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
  serverExternalPackages: ['rss-parser', '@sparticuz/chromium', 'puppeteer-core'],
  images: {
    // Feed items carry images from arbitrary publisher CDNs. We render them
    // through plain <img> tags rather than next/image to avoid a domain allowlist
    // that would break every time a source changes CDN.
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
      },
    ];
  },
};

export default nextConfig;
