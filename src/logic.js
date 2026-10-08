import { all, daily, getState } from './store.js';
import { toMin, addDays, today } from './util.js';
import { BLOCK_TYPES } from './defaults.js';

/** Bloky dne podle rozvrhu + denní úpravy (rozdělení, přeplánování, stavy). */
export function dayBlocks(day) {
  const { settings } = getState();
  const log = daily('daylog', day);
  const st = log.blocks || {};
  const out = [];
  const sched = [...settings.schedule].sort((a, b) => toMin(a.start) - toMin(b.start));
  for (const b of sched) {
    let s = toMin(b.start), e = toMin(b.end);
    if (e <= s) e = s + 30;
    const parts = b.splittable && log.split?.[b.id]
      ? [{ id: b.id + 'a', s, e: s + Math.floor((e - s - 10) / 2), n: 1 }, { id: b.id + 'b', s: s + Math.ceil((e - s + 10) / 2), e, n: 2 }]
      : [{ id: b.id, s, e }];
    for (const p of parts) {
      const o = st[p.id] || {};
      out.push({
        id: p.id, baseId: b.id, title: p.n ? `${b.title} · blok ${p.n}` : b.title, type: b.type,
        splittable: !!b.splittable, split: !!log.split?.[b.id],
        start: o.start ?? p.s, end: o.end ?? p.e, origStart: p.s, origEnd: p.e,
        status: o.status || 'pending', goal: o.goal || '', moved: o.start != null,
        deep: BLOCK_TYPES[b.type]?.deep || false,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function deepEntries(day) { return all('deep_block').filter((r) => r.day === day); }
export function deepMin(day) { return deepEntries(day).reduce((a, r) => a + (r.data.actualMin || 0), 0); }

export function deepByDay() {
  const m = new Map();
  for (const r of all('deep_block')) m.set(r.day, (m.get(r.day) || 0) + (r.data.actualMin || 0));
  return m;
}

export function sleepHours(sl) {
  if (!sl || !sl.bed || !sl.wake) return null;
  let b = toMin(sl.bed), w = toMin(sl.wake);
  if (w <= b) w += 1440;
  return (w - b) / 60;
}

export function routineDone(day) {
  const { settings } = getState();
  const r = daily('routine', day);
  return settings.routine.length > 0 && settings.routine.every((it) => r[it.key]);
}

/** Hodnota návyku pro den: true/false, nebo číslo u "deep" (minuty). */
export function habitValue(key, day) {
  const { settings } = getState();
  switch (key) {
    case 'routine': return routineDone(day);
    case 'gym': return !!daily('body', day).gym?.done;
    case 'sauna': return !!daily('body', day).sauna?.done;
    case 'water': return (daily('body', day).waterMl || 0) >= settings.waterGoalMl;
    case 'sleep': { const h = sleepHours(daily('body', day).sleep); return h != null && h >= settings.sleepGoalH; }
    case 'journal': { const j = daily('journal', day); return !!(j.text || j.mood || j.answer); }
    case 'detox': return !!daily('influence', day).detox;
    case 'social': { const i = daily('influence', day); return i.socialMin != null && i.socialMin <= settings.socialLimitMin; }
    case 'shutdown': return !!daily('shutdown', day).closed;
    case 'deep': return deepMin(day);
    default: return false;
  }
}

/** Aktuální série: dnešek se nepočítá jako přerušení, pokud ještě není splněn. */
export function streak(key) {
  let d = today(), n = 0;
  const ok = (day) => { const v = habitValue(key, day); return typeof v === 'number' ? v > 0 : v; };
  if (!ok(d)) d = addDays(d, -1);
  for (let i = 0; i < 3650 && ok(d); i++) { n++; d = addDays(d, -1); }
  return n;
}
export function bestStreak(key, days = 365) {
  let best = 0, cur = 0, d = addDays(today(), -days);
  const ok = (day) => { const v = habitValue(key, day); return typeof v === 'number' ? v > 0 : v; };
  for (let i = 0; i <= days; i++) { if (ok(d)) { cur++; best = Math.max(best, cur); } else cur = 0; d = addDays(d, 1); }
  return best;
}

/** Počet splnění (nebo minut u deep) v rozsahu dní [from, to]. */
export function habitCount(key, from, to) {
  let n = 0, d = from;
  for (let i = 0; i < 400 && d <= to; i++) {
    const v = habitValue(key, d);
    n += typeof v === 'number' ? v : v ? 1 : 0;
    d = addDays(d, 1);
  }
  return n;
}
