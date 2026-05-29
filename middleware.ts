import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, SESSION_TOKEN } from '@/lib/auth-config';

// Single-admin gate. A successful POST to /api/login sets the httpOnly
// `rsos_admin` cookie; the middleware just checks for it. No Supabase auth
// session involved — the dashboard reads data with the public anon key, which
// already has the right RLS policies.
//
// Routes that require the admin cookie:
//   /[locale]/dashboard, /[locale]/analytics, /[locale]/admin/*
//   /[locale]/track/<incidentId>   (but NOT /track/family/<code>)
//
// Public routes (intentionally NOT gated):
//   /[locale]/login                 — the login form itself
//   /[locale]/sos                   — public emergency SOS form
//   /[locale]/track/family/[code]   — family tracking via shared code
//   /[locale]/ (root redirect)
//   /ice/[id]                       — public ICE card (time-limited in-page)
//   /api/*                          — API routes
const PROTECTED_RE = /^\/[a-z]{2}\/(dashboard|analytics|admin)(\/|$)/;
const PROTECTED_TRACK_RE = /^\/[a-z]{2}\/track\/(?!family\/)[^/]+\/?$/;

function needsAuth(pathname: string): boolean {
  return PROTECTED_RE.test(pathname) || PROTECTED_TRACK_RE.test(pathname);
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!needsAuth(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token === SESSION_TOKEN) return NextResponse.next();

  const locale = pathname.split('/')[1] || 'en';
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}/login`;
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
