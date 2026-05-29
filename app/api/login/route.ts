import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_COOKIE, SESSION_TOKEN } from '@/lib/auth-config';

// Single hardcoded admin login for the dispatcher dashboard.
// Credentials live server-side (env override, with a hackathon default) so
// they're never shipped in the client bundle. On success we set an httpOnly
// cookie that the middleware checks to gate protected routes.

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const username = (body.username ?? '').trim();
  const password = body.password ?? '';

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, SESSION_TOKEN, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12, // 12 hours
  });
  return res;
}
