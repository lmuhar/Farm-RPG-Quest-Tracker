import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { widgetSummary } from './widget';

declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '8080', 10);

const app = express();
app.disable('x-powered-by');

// ── iOS widget ───────────────────────────────────────────────────────────────
// The widget sends its key in the X-Widget-Key header. The key goes to the
// Supabase function widget_state, which only returns the data saved by the
// user that key belongs to. This server holds no secret of its own.
const hits = new Map<string, { n: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now > h.reset) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    if (hits.size > 10_000) hits.clear();
    return false;
  }
  return ++h.n > 30;
}

app.get('/api/widget', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (rateLimited(req.get('fly-client-ip') ?? req.ip ?? '')) return res.status(429).json({ error: 'Too many requests' });
  const key = req.get('x-widget-key') ?? '';
  if (key.length < 32 || key.length > 128) return res.status(401).json({ error: 'Missing or invalid widget key' });
  try {
    const r = await fetch(`${__SUPABASE_URL__}/rest/v1/rpc/widget_state`, {
      method: 'POST',
      headers: {
        apikey: __SUPABASE_ANON_KEY__,
        Authorization: `Bearer ${__SUPABASE_ANON_KEY__}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_key: key }),
    });
    if (!r.ok) return res.status(502).json({ error: 'Could not reach saved data' });
    const row = (await r.json()) as { state: object; updated_at: string } | null;
    if (!row) return res.status(401).json({ error: 'Unknown widget key' });
    res.json(widgetSummary(row.state, row.updated_at));
  } catch {
    res.status(502).json({ error: 'Could not reach saved data' });
  }
});

app.use(express.static(path.join(__dirname, '../dist')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Farm RPG Tracker running on port ${PORT}`);
});
