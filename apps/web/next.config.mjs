import createWithVercelToolbar from '@vercel/toolbar/plugins/next';

/** Portal app origin — separate deployable (`apps/portal`). Override in env for prod.
 *  Local default is :3100 (not :3001) so a website bumped off a busy :3000
 *  cannot silently occupy the portal port. */
const PORTAL_ORIGIN = (
  process.env.NEXT_PUBLIC_PORTAL_URL || 'http://localhost:3100'
).replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    'three',
    '@react-three/fiber',
    '@react-three/drei',
    '@warehaus/tokens',
    '@warehaus/logic',
  ],
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
      // Portal lives in apps/portal (own app / subdomain), not inside the website.
      {
        source: '/portal',
        destination: PORTAL_ORIGIN,
        permanent: false,
      },
      {
        source: '/portal/:path*',
        destination: `${PORTAL_ORIGIN}/:path*`,
        permanent: false,
      },
    ];
  },
};

const withVercelToolbar = createWithVercelToolbar();
export default withVercelToolbar(nextConfig);
