import { NextResponse, type NextRequest } from 'next/server';
import {
  parseHostTenant,
  TENANT_MODE_HEADER,
  TENANT_SLUG_HEADER,
} from '@/lib/auth/tenancy';
import { fixturePreviewAllowed } from '@/lib/data/fixturePreviewGate';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const fixturePath = pathname === '/preview' || pathname.startsWith('/preview/');
  if (fixturePath && !fixturePreviewAllowed()) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    return NextResponse.redirect(login);
  }

  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const hint = parseHostTenant(host);

  const requestHeaders = new Headers(request.headers);
  if (fixturePath) {
    requestHeaders.set('x-portal-fixture-preview', '1');
  }
  requestHeaders.set(TENANT_MODE_HEADER, hint.mode);
  if (hint.slug) {
    requestHeaders.set(TENANT_SLUG_HEADER, hint.slug);
  } else {
    requestHeaders.delete(TENANT_SLUG_HEADER);
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and Next internals.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
