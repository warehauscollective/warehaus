import createWithVercelToolbar from '@vercel/toolbar/plugins/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  async redirects() {
    return [
      {
        source: '/work',
        destination: '/codex',
        permanent: true,
      },
      {
        source: '/work/:slug',
        destination: '/codex/:slug',
        permanent: true,
      },
    ];
  },
};

const withVercelToolbar = createWithVercelToolbar();
export default withVercelToolbar(nextConfig);
