// Shared admin-auth constants. Kept out of the route handlers because Next.js
// route files may only export HTTP-method handlers + a few reserved config
// names — any other export (like a cookie constant) fails the type check.

export const SESSION_COOKIE = 'rsos_admin';

// Opaque session token — not derived from the password, so a leaked cookie
// doesn't leak the credential. Override via env in a real deployment.
export const SESSION_TOKEN = process.env.ADMIN_SESSION_TOKEN ?? 'rsos-dispatcher-ok-2026';

export const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin@6849';
