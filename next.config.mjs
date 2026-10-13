/** @type {import('next').NextConfig} */
const nextConfig = {
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
