/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@warehaus/logic', '@warehaus/tokens', '@warehaus/ui'],
  async redirects() {
    return [
      // Home is `/` on this app (the portal. host). Nested /portal and
      // /dashboard paths are leftovers from the website URL mental model.
      { source: '/dashboard', destination: '/', permanent: true },
      { source: '/portal', destination: '/', permanent: false },
      { source: '/portal/:path*', destination: '/:path*', permanent: false },
    ];
  },
};

export default nextConfig;
