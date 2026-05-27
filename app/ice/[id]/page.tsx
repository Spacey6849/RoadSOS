import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';

// 24 hours after the incident the ICE card stops resolving — beyond that
// window the medical info is rarely useful to a first responder and the URL
// is too likely to have leaked (referer, browser sync, screenshot sharing).
// A leaked QR thus expires automatically.
const ICE_TTL_MS = 24 * 60 * 60 * 1000;

// Server component — reads incident data for ICE card
async function getIncident(id: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await supabase
    .from('incidents')
    .select('id,user_name,blood_group,created_at')
    .eq('id', id)
    .single();
  return data;
}

export default async function ICECardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const incident = await getIncident(id);
  if (!incident) notFound();

  // Drop expired ICE cards. Use `notFound()` rather than a "expired" page so
  // an enumerator can't tell whether an ID existed-but-aged-out vs never
  // existed.
  const createdAt = new Date(incident.created_at).getTime();
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > ICE_TTL_MS) {
    notFound();
  }

  const shortId = incident.id.slice(0, 8).toUpperCase();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>ICE Card — {incident.user_name || shortId}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #1a1a1a; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
          .card { background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); max-width: 380px; width: 100%; overflow: hidden; }
          .header { background: #d93025; padding: 20px 24px; color: #fff; }
          .header h1 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8; margin-bottom: 4px; }
          .header h2 { font-size: 22px; font-weight: 700; }
          .body { padding: 20px 24px; }
          .row { display: flex; justify-content: space-between; align-items: baseline; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
          .row:last-child { border-bottom: none; }
          .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; }
          .value { font-size: 15px; font-weight: 600; color: #1a1a1a; }
          .blood { font-size: 28px; font-weight: 700; color: #d93025; }
          .footer { padding: 12px 24px; background: #f9f9f9; border-top: 1px solid #eee; font-size: 11px; color: #aaa; text-align: center; }
          @media print { body { background: #fff; } .card { box-shadow: none; } }
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="header">
            <h1>In Case of Emergency</h1>
            <h2>{incident.user_name || 'Unknown'}</h2>
          </div>
          <div className="body">
            <div className="row">
              <span className="label">Blood Group</span>
              <span className="blood">{incident.blood_group || '—'}</span>
            </div>
            <div className="row">
              <span className="label">Incident ID</span>
              <span className="value" style={{ fontFamily: 'monospace', color: '#d93025' }}>{shortId}</span>
            </div>
            <div className="row">
              <span className="label">Reported</span>
              <span className="value" style={{ fontSize: 13 }}>
                {new Date(incident.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </div>
          </div>
          <div className="footer">
            RoadSoS Emergency Platform · roadsos.app
          </div>
        </div>
      </body>
    </html>
  );
}
