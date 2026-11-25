/** @type {import('next').NextConfig} */
const nextConfig = {
  // The card renderer reads its bundled fonts from disk at run time
  outputFileTracingIncludes: { '/api/ops/social/render': ['./lib/ops/fonts/**', './public/brand/ep-mark-*.png'] },
  async rewrites() {
    return {
      afterFiles: [
        // Kalighat cutouts are shared with the Practice Report app (used in course page previews).
        { source: '/kalighat/:file', destination: 'https://report.embodiedphilosophy.com/img/:file' },
      ],
    };
  },
};
export default nextConfig;
