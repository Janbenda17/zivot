// Upozornění i se zavřenou aplikací: aplikace naplánuje frontu (push_queue) na dnešek a zítřek,
// server ji každou minutu odešle. Podmínka (cond) umožní serveru upozornění přeskočit, když je věc hotová.
import { sb, getState, daily, onChange, setSettings } from './store.js';
import { today, addDays, parseDay, fromMin, toMin, weekStart } from './util.js';
import { dayBlocks, tasksFor } from './logic.js';
import { timerState, remainingSec } from './timer.js';

export const VAPID_PUBLIC = 'BAZfEjRt-XVFfaTREc3R7yFgBrjWR_OQSSnzcHxL0uPJbhLW_8rtEu_Dp6RF_0djUG9FH_VLXNDNmjva-5yhWlY';
export const ENERGY_SLOTS = [
  { at: 660, from: 540, to: 780, label: 'dopoledne' },
  { at: 930, from: 780, to: 1080, label: 'odpoledne' },
  { at: 1230, from: 1080, to: 1440, label: 'večer' },
];

export function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
export function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
export function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function registration() {
  if (!('serviceWorker' in navigator)) throw new Error('Prohlížeč nepodporuje upozornění.');
  return (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.register('/sw.js');
}

export async function currentSubscription() {
  try { const reg = await registration(); return await reg.pushManager.getSubscription(); } catch { return null; }
}

/** Zapne upozornění na tomto zařízení. Vrací text chyby, nebo null. */
export async function enablePush() {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'Na iPhonu nejdřív přidej aplikaci na plochu (Sdílet → Přidat na plochu) a otevři ji odtud.' : 'Tento prohlížeč upozornění nepodporuje.';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'Upozornění jsou zablokovaná. Povol je v nastavení prohlížeče nebo telefonu.';
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) }));
    const j = sub.toJSON();
    const { error } = await sb.from('push_subs').upsert({ user_id: getState().user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' });
    if (error) throw error;
    setSettings({ push: true });
    await syncQueue(true);
    return null;
  } catch (e) {
    return 'Upozornění se nepodařilo zapnout: ' + (e.message || e);
  }
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) { await sb.from('push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe().catch(() => {}); }
  setSettings({ push: false });
  await sb.from('push_queue').delete().is('sent_at', null).eq('source', 'app');
}

export async function testPush() {
  const { error } = await sb.from('push_queue').insert({ user_id: getState().user.id, fire_at: new Date().toISOString(), title: 'Zkušební upozornění', body: 'Funguje to. Takhle ti budou chodit připomínky.', tag: 'test', source: 'test' });
  return error ? error.message : null;
}

const at = (day, min) => new Date(parseDay(day).getTime() + Math.round(min) * 60000);

/** Fronta upozornění pro dnešek a zítřek. */
export function buildQueue() {
  const { settings: s } = getState();
  const T = s.pushTypes || {};
  const lead = s.notifyLeadMin || 0;
  const out = [];
  const now = Date.now();
  const push = (fire, title, body, extra = {}) => { if (fire.getTime() > now + 20000) out.push({ fire_at: fire.toISOString(), title, body, tag: extra.tag || null, url: extra.url || '/#/dnes', cond: extra.cond || null }); };
  for (const day of [today(), addDays(today(), 1)]) {
    const blocks = dayBlocks(day);
    const tasks = tasksFor(day);
    if (T.blocks) for (const b of blocks) {
      if (b.status !== 'pending') continue;
      const bt = tasks.filter((x) => x.data.blockId === b.id && !x.data.done);
      let body = `${fromMin(b.start)}–${fromMin(b.end)}${b.goal ? ' · ' + b.goal : ''}${bt.length ? ` · ${bt.length} úk.` : ''}`;
      if (b.type === 'shutdown') body += ' · uzavři den a naplánuj zítřek';
      if (b.type === 'sleep') body = 'Odlož telefon. Zítra začínáš v ' + (dayBlocks(addDays(day, 1)).find((x) => x.type !== 'sleep') ? fromMin(dayBlocks(addDays(day, 1)).find((x) => x.type !== 'sleep').start) : '–');
      push(at(day, b.start - (b.type === 'sleep' ? 0 : lead)), b.type === 'sleep' ? 'Čas jít spát' : lead && b.type !== 'sleep' ? `Za ${lead} min: ${b.title}` : `Teď: ${b.title}`, body, { tag: 'block', cond: `block:${day}:${b.id}`, url: b.deep ? '/#/blok' : '/#/dnes' });
    }
    if (T.plan) push(at(day, toMin(s.planRemindAt || '21:30')), 'Naplánuj zítřek', 'Pět minut večer = klidné ráno. Typ dne, hlavní úkol, cíle bloků.', { tag: 'plan', cond: `plan:${addDays(day, 1)}`, url: '/#/zitra' });
    const first = blocks.find((b) => b.type !== 'sleep');
    if (T.sleep && first) push(at(day, first.start + 45), 'Jak ses vyspal?', 'Zapiš čas probuzení a kvalitu spánku.', { tag: 'sleep', cond: `sleep:${day}`, url: '/#/telo' });
    if (T.water) {
      push(at(day, 14 * 60), 'Pitný režim', 'Máš vypito méně než polovinu denního cíle.', { tag: 'water', cond: `water:${day}:${Math.round(s.waterGoalMl / 2)}`, url: '/#/telo' });
      push(at(day, 18 * 60), 'Pitný režim', 'Do cíle ti ještě chybí. Dej si sklenici vody.', { tag: 'water', cond: `water:${day}:${Math.round(s.waterGoalMl * 0.75)}`, url: '/#/telo' });
    }
    if (T.energy && s.energyPrompts) for (const sl of ENERGY_SLOTS) push(at(day, sl.at), 'Jak máš energii?', `Jedno klepnutí 1–5 (${sl.label}).`, { tag: 'energy', cond: `energy:${day}:${sl.from}-${sl.to}`, url: '/#/dnes' });
    if (T.review && parseDay(day).getDay() === 0) push(at(day, 19 * 60), 'Týdenní revize', '10 minut: co se povedlo, co drhlo, cíle na další týden.', { tag: 'review', cond: `review:${weekStart(day)}`, url: '/#/revize' });
  }
  const t = timerState();
  if (T.timer && t && (t.phase === 'running' || t.phase === 'break') && !t.pausedAt) {
    const end = new Date(now + remainingSec(t) * 1000);
    push(end, t.phase === 'break' ? 'Pauza skončila' : 'Blok skončil', t.phase === 'break' ? 'Čas na další blok, nebo konec práce.' : t.goal ? `Cíl: ${t.goal}. Prodloužit, nebo ohodnotit?` : 'Prodloužit, nebo ohodnotit?', { tag: 'timer', url: '/#/blok' });
  }
  return out;
}

let lastSig = '';
let busy = false, again = false;
export async function syncQueue(force = false) {
  const st = getState();
  if (!st.user || !st.settings.push || !st.online) return;
  if (busy) { again = true; return; }
  const items = buildQueue();
  const sig = JSON.stringify(items);
  if (!force && sig === lastSig) return;
  busy = true;
  try {
    const del = await sb.from('push_queue').delete().is('sent_at', null).eq('source', 'app');
    if (del.error) throw del.error;
    if (items.length) {
      const ins = await sb.from('push_queue').insert(items.map((x) => ({ ...x, user_id: st.user.id, source: 'app' })));
      if (ins.error) throw ins.error;
    }
    lastSig = sig;
  } catch (e) { lastSig = ''; }
  busy = false;
  if (again) { again = false; scheduleSync(1000); }
}

let t = null;
export function scheduleSync(ms = 5000) { clearTimeout(t); t = setTimeout(() => syncQueue(), ms); }

export function startPushSync() {
  onChange(() => scheduleSync(5000));
  window.addEventListener('zivot-timer', () => scheduleSync(800));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(1500); });
  setInterval(() => scheduleSync(0), 30 * 60e3); // po půlnoci přibude nový "zítřek"
  scheduleSync(3000);
}
