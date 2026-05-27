import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Routes that require an authenticated dispatcher session. Anything matching
// these patterns gets redirected to /[locale]/login if there's no session.
//
// Public routes (intentionally NOT gated):
//   /[locale]/login, /[locale]/signup       — auth UI
//   /[locale]/sos                           — public emergency SOS form
//   /[locale]/track/family/[code]           — family tracking via shared code
//   /[locale]/ (root redirect)
//   /ice/[id]                                — public ICE card (separately
//                                              time-limited inside the page)
//   /api/sos                                 — public SOS POST endpoint
//   /auth/callback                           — OAuth code exchange
const PROTECTED_RE = /^\/[a-z]{2}\/(dashboard|analytics|admin)(\/|$)/;
const PROTECTED_TRACK_RE = /^\/[a-z]{2}\/track\/(?!family\/)[^/]+\/?$/;

function needsAuth(pathname: string): boolean {
  return PROTECTED_RE.test(pathname) || PROTECTED_TRACK_RE.test(pathname);
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  if (needsAuth(pathname) && !user) {
    const locale = pathname.split('/')[1] || 'en';
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
