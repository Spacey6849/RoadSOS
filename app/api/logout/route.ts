import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth-config';

// Clears the admin session cookie. POST (not GET) so a stray link/prefetch
// can't log the user out.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}
