import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'preact/hooks';
import { uuid } from './util.js';
import { DEFAULT_SETTINGS } from './defaults.js';

const SUPABASE_URL = 'https://ajafpizwhifnmitnuyuj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gg-iEB58NjhWrNz4yNoB7A__o6dr7mB';
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const DAILY = ['daylog', 'routine', 'body', 'shutdown', 'journal', 'influence', 'leisure_check'];

const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

const state = {
  user: null,
  rows: new Map(), // id -> row
  settings: structuredClone(DEFAULT_SETTINGS),
  loaded: false,
  online: navigator.onLine,
  syncing: false,
  error: null,
};
let version = 0;
const listeners = new Set();
function emit() { version++; listeners.forEach((f) => f(version)); }

export function useStore() {
  const [, set] = useState(0);
  useEffect(() => { listeners.add(set); return () => listeners.delete(set); }, []);
  return state;
}

// ---------- cache & outbox ----------
const cacheKey = () => `zivot.cache.${state.user?.id}`;
const outboxKey = () => `zivot.outbox.${state.user?.id}`;
let saveCacheT = null;
function saveCache() {
  clearTimeout(saveCacheT);
  saveCacheT = setTimeout(() => LS.set(cacheKey(), { rows: [...state.rows.values()], settings: state.settings }), 300);
}
function outbox() { return LS.get(outboxKey()) || []; }
function pushOp(op) {
  // sloučit opakované zápisy stejného řádku
  const ob = outbox().filter((o) => !(o.id === op.id && o.table === op.table));
  ob.push(op);
  LS.set(outboxKey(), ob);
  scheduleFlush();
}
let flushT = null;
function scheduleFlush(ms = 400) { clearTimeout(flushT); flushT = setTimeout(flush, ms); }
let flushing = false;
async function flush() {
  if (flushing || !state.user) return;
  const ob = outbox();
  if (!ob.length) { if (state.syncing) { state.syncing = false; emit(); } return; }
  flushing = true; state.syncing = true; emit();
  const remaining = [];
  for (const op of ob) {
    try {
      let res;
      if (op.table === 'settings') res = await sb.from('settings').upsert({ user_id: state.user.id, data: op.data });
      else if (op.type === 'delete') res = await sb.from('entries').delete().eq('id', op.id);
      else res = await sb.from('entries').upsert(op.row);
      if (res.error) throw res.error;
    } catch (e) {
      if (e && e.code === '23505' && op.row) {
        // jiný přístroj už vytvořil denní záznam: sloučit s ním
        const { data } = await sb.from('entries').select('*').eq('kind', op.row.kind).eq('day', op.row.day).maybeSingle();
        if (data) {
          const merged = { ...data, data: { ...data.data, ...op.row.data } };
          state.rows.delete(op.row.id); state.rows.set(merged.id, merged);
          await sb.from('entries').update({ data: merged.data }).eq('id', merged.id);
          continue;
        }
      }
      state.error = 'Nepodařilo se uložit, zkusím to znovu.';
      remaining.push(op);
    }
  }
  // ponechat i operace přidané během flush
  const sent = new Set(ob.map((o) => JSON.stringify(o)));
  const later = outbox().filter((o) => !sent.has(JSON.stringify(o)));
  const keep = remaining.filter((r) => !later.some((l) => l.id === r.id && l.table === r.table));
  LS.set(outboxKey(), [...keep, ...later]);
  flushing = false;
  state.syncing = remaining.length + later.length > 0;
  if (!remaining.length) state.error = null;
  emit(); saveCache();
  if (later.length) scheduleFlush(100);
  else if (remaining.length) scheduleFlush(15000);
}
window.addEventListener('online', () => { state.online = true; emit(); scheduleFlush(50); });
window.addEventListener('offline', () => { state.online = false; emit(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.user) { scheduleFlush(50); refresh(); } });

// ---------- load ----------
export async function initAuth() {
  const { data } = await sb.auth.getSession();
  await setUser(data.session?.user || null);
  sb.auth.onAuthStateChange((_e, session) => {
    const u = session?.user || null;
    if ((u && u.id) !== (state.user && state.user.id)) setUser(u);
  });
}
async function setUser(u) {
  state.user = u; state.rows = new Map(); state.settings = structuredClone(DEFAULT_SETTINGS); state.loaded = false;
  if (u) {
    const c = LS.get(cacheKey());
    if (c) { c.rows.forEach((r) => state.rows.set(r.id, r)); state.settings = mergeSettings(c.settings); state.loaded = true; }
    emit();
    await refresh();
    scheduleFlush(50);
  } else emit();
}
function mergeSettings(s) { return { ...structuredClone(DEFAULT_SETTINGS), ...(s || {}) }; }

let refreshing = false;
export async function refresh() {
  if (!state.user || refreshing) return;
  refreshing = true;
  try {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('entries').select('*').order('created_at').range(from, from + 999);
      if (error) throw error;
      all.push(...data);
      if (data.length < 1000) break;
    }
    const { data: s, error: se } = await sb.from('settings').select('data').maybeSingle();
    if (se) throw se;
    const pending = outbox();
    const map = new Map(all.map((r) => [r.id, r]));
    // nepřepsat neodeslané lokální změny
    for (const op of pending) {
      if (op.table !== 'entries') continue;
      if (op.type === 'delete') map.delete(op.id);
      else map.set(op.row.id, { ...(map.get(op.row.id) || {}), ...op.row });
    }
    state.rows = map;
    const pendingSettings = pending.find((o) => o.table === 'settings');
    state.settings = mergeSettings(pendingSettings ? pendingSettings.data : s?.data);
    state.loaded = true; state.error = null;
    emit(); saveCache();
  } catch (e) {
    state.loaded = true;
    if (!state.rows.size) state.error = 'Data se nepodařilo načíst. Zkontroluj připojení.';
    emit();
  } finally { refreshing = false; }
}

// ---------- API ----------
export function all(kind) {
  const out = [];
  for (const r of state.rows.values()) if (r.kind === kind) out.push(r);
  return out;
}
export function dailyRow(kind, day) {
  for (const r of state.rows.values()) if (r.kind === kind && r.day === day) return r;
  return null;
}
export function daily(kind, day) { return dailyRow(kind, day)?.data || {}; }
export function setDaily(kind, day, patch) {
  let r = dailyRow(kind, day);
  const data = typeof patch === 'function' ? patch(r?.data || {}) : { ...(r?.data || {}), ...patch };
  r = r ? { ...r, data } : { id: uuid(), user_id: state.user.id, kind, day, data, created_at: new Date().toISOString() };
  state.rows.set(r.id, r);
  emit(); saveCache();
  pushOp({ table: 'entries', type: 'upsert', id: r.id, row: { id: r.id, user_id: r.user_id, kind, day, data } });
  return r;
}
export function add(kind, data, day = null) {
  const r = { id: uuid(), user_id: state.user.id, kind, day, data, created_at: new Date().toISOString() };
  state.rows.set(r.id, r); emit(); saveCache();
  pushOp({ table: 'entries', type: 'upsert', id: r.id, row: { id: r.id, user_id: r.user_id, kind, day, data, created_at: r.created_at } });
  return r;
}
export function update(id, patch) {
  const r = state.rows.get(id); if (!r) return;
  const data = typeof patch === 'function' ? patch(r.data) : { ...r.data, ...patch };
  const nr = { ...r, data };
  state.rows.set(id, nr); emit(); saveCache();
  pushOp({ table: 'entries', type: 'upsert', id, row: { id, user_id: r.user_id, kind: r.kind, day: r.day, data, created_at: r.created_at } });
}
export function remove(id) {
  state.rows.delete(id); emit(); saveCache();
  pushOp({ table: 'entries', type: 'delete', id });
}
export function setSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  emit(); saveCache();
  pushOp({ table: 'settings', type: 'upsert', id: 'settings', data: state.settings });
}
export function getState() { return state; }
export function exportData() {
  return {
    exported_at: new Date().toISOString(),
    email: state.user?.email,
    settings: state.settings,
    entries: [...state.rows.values()].map(({ id, kind, day, data, created_at }) => ({ id, kind, day, data, created_at })),
  };
}
export async function signOut() {
  LS.del(cacheKey());
  await sb.auth.signOut();
}
