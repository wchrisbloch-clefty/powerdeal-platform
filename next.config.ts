import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Server-only packages that must not be bundled into the client graph.
  serverExternalPackages: ['rss-parser'],
  // lib/prompts/system.ts reads the brain at runtime via fs. Next's tracer
  // can't see a dynamic join(process.cwd(), ...), so include it explicitly —
  // otherwise every domain task 500s on Vercel with ENOENT.
  outputFileTracingIncludes: {
    '/api/**/*': ['./prompts/**/*'],
    '/app/**/*': ['./prompts/**/*'],
  },
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
