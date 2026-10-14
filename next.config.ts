import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      // the service worker and the pages must never be served from a stale browser/CDN cache
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
      // models keep their file names: browsers may reuse them for a day and refresh in the background for a week (the service worker does the same)
      { source: '/models/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }] },
      { source: '/', headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }] },
    ];
  },
};
export default nextConfig;