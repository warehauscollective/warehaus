/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@warehaus/logic', '@warehaus/tokens'],
  async redirects() {
    return [
      // Old scaffold path — portal home is `/` on the portal subdomain.
      { source: '/dashboard', destination: '/', permanent: true },
    ];
  },
};

export default nextConfig;
