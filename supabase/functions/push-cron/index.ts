// Odesílá naplánovaná upozornění (tabulka push_queue) jako web push.
// Volá ji pg_cron každou minutu s hlavičkou x-cron-secret.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

type Row = { id: string; user_id: string; title: string; body: string; tag: string | null; url: string | null; cond: string | null; fire_at: string };

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: sec, error: secErr } = await sb.from('app_secrets').select('name,value');
  if (secErr) return new Response('secrets: ' + secErr.message, { status: 500 });
  const S = Object.fromEntries((sec || []).map((r) => [r.name, r.value]));
  if (!S.cron_secret || req.headers.get('x-cron-secret') !== S.cron_secret) return new Response('forbidden', { status: 403 });
  webpush.setVapidDetails('https://zivot-three.vercel.app', S.vapid_public, S.vapid_private);

  const now = Date.now();
  const { data: due, error } = await sb.from('push_queue').select('*').is('sent_at', null)
    .lte('fire_at', new Date(now).toISOString()).gte('fire_at', new Date(now - 15 * 60e3).toISOString()).order('fire_at').limit(200);
  if (error) return new Response('queue: ' + error.message, { status: 500 });

  const entryCache = new Map<string, Record<string, any> | null>();
  async function entry(user: string, kind: string, day: string) {
    const k = `${user}|${kind}|${day}`;
    if (!entryCache.has(k)) {
      const { data } = await sb.from('entries').select('data').eq('user_id', user).eq('kind', kind).eq('day', day).limit(1).maybeSingle();
      entryCache.set(k, data?.data || null);
    }
    return entryCache.get(k) || {};
  }
  // Vrací true, pokud upozornění už nedává smysl (věc je hotová).
  async function satisfied(r: Row): Promise<boolean> {
    if (!r.cond) return false;
    const [type, day, arg] = r.cond.split(':');
    const u = r.user_id;
    switch (type) {
      case 'plan': return !!(await entry(u, 'daylog', day)).planned;
      case 'block': { const st = (await entry(u, 'daylog', day)).blocks?.[arg]?.status; return st === 'done' || st === 'skipped' || !!(await entry(u, 'daylog', day)).blocks?.[arg]?.removed; }
      case 'water': return ((await entry(u, 'body', day)).waterMl || 0) >= Number(arg || 0);
      case 'sleep': return !!(await entry(u, 'body', day)).sleep?.wake;
      case 'shutdown': return !!(await entry(u, 'shutdown', day)).closed;
      case 'review': return !!(await entry(u, 'review', day)).done;
      case 'energy': { const log = (await entry(u, 'journal', day)).energyLog || []; const [a, b] = (arg || '0-0').split('-').map(Number); return log.some((x: any) => x.t >= a && x.t < b); }
      default: return false;
    }
  }

  const subsCache = new Map<string, any[]>();
  let sent = 0, skipped = 0, failed = 0;
  for (const r of (due || []) as Row[]) {
    const done = await satisfied(r).catch(() => false);
    if (!done) {
      if (!subsCache.has(r.user_id)) {
        const { data } = await sb.from('push_subs').select('*').eq('user_id', r.user_id);
        subsCache.set(r.user_id, data || []);
      }
      const payload = JSON.stringify({ title: r.title, body: r.body, tag: r.tag, url: r.url || '/#/dnes' });
      for (const s of subsCache.get(r.user_id)!) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 900, urgency: 'high' });
          sent++;
        } catch (e: any) {
          failed++;
          if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('push_subs').delete().eq('id', s.id);
          else console.error('push failed', e?.statusCode, e?.body || e?.message);
        }
      }
    } else skipped++;
    await sb.from('push_queue').update({ sent_at: new Date().toISOString() }).eq('id', r.id);
  }
  // úklid
  await sb.from('push_queue').delete().lt('fire_at', new Date(now - 3 * 864e5).toISOString());
  return new Response(JSON.stringify({ due: due?.length || 0, sent, skipped, failed }), { headers: { 'Content-Type': 'application/json' } });
});
