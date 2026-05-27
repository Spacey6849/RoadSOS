import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

// Server-side only — service role key never exposed to client.
// Created lazily (not at module scope) so `next build` doesn't evaluate it:
// a missing key then fails per-request instead of breaking the build.
let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (supabaseClient) return supabaseClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }
  supabaseClient = createClient(url, serviceRoleKey);
  return supabaseClient;
}

// Hash the client IP before storing — avoids landing raw IPs (PII) in a
// row that any anon-key reader can fetch. SHA-256 truncated to 16 chars is
// plenty for a rate-limit bucket key (~10^19 buckets) and isn't reversible.
function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

// CORS: only allow same-origin POSTs from the deployed UI. Returning the
// allowed origin echoed back means browsers from other origins get blocked
// at the CORS layer without our endpoint doing the write.
function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin browser fetches usually omit Origin
  try {
    const reqOrigin = new URL(req.url).origin;
    return origin === reqOrigin;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }
  try {
    const supabase = getSupabase();
    const { name, phone, lat, lng } = await req.json();

    if (!name?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: 'Name and phone required' }, { status: 400 });
    }
    // Permissive phone shape — digits, +, spaces, dashes, parens, min 3 chars.
    if (!/^[0-9+\-\s()]{3,}$/.test(phone.trim())) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }
    // Length caps so an attacker can't stuff arbitrarily large rows.
    if (name.length > 120 || phone.length > 24) {
      return NextResponse.json({ error: 'Name or phone too long' }, { status: 400 });
    }

    // Rate limit by hashed IP, not raw IP. Vercel sets x-forwarded-for from
    // the real client and strips spoofed values; we still take the first hop
    // (left-most) which is the client per the spec.
    const ipRaw = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const ipHash = hashIp(ipRaw);
    const rateKey = `web-sos:${ipHash}`;
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count } = await supabase
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .eq('address', rateKey)
      .gte('created_at', oneHourAgo);

    if ((count ?? 0) >= 3) {
      return NextResponse.json({ error: 'Too many requests. Please call emergency services directly.' }, { status: 429 });
    }

    // Build location string for PostGIS if coordinates provided
    const locationValue = lat && lng ? `POINT(${lng} ${lat})` : null;

    const { data, error } = await supabase.from('incidents').insert({
      user_name: name.trim(),
      trigger_type: 'manual',
      status: 'active',
      address: rateKey,
      ...(locationValue && { location: locationValue }),
      sms_status: [{ phone: phone.trim(), name: name.trim(), sent: false }],
    }).select('id').single();

    if (error) throw error;

    return NextResponse.json({ id: data.id });
  } catch (err: unknown) {
    if (process.env.NODE_ENV !== 'production') console.error('SOS API error:', err);
    return NextResponse.json({ error: 'Failed to send SOS' }, { status: 500 });
  }
}
