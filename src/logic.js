import { all, daily, getState, setDaily, add, update } from './store.js';
import { toMin, addDays, today, parseDay } from './util.js';
import { BLOCK_TYPES } from './defaults.js';

// ---------------- šablony a bloky ----------------
export function templates() { return getState().settings.templates || []; }
export function templateIdFor(day) {
  const log = daily('daylog', day);
  const tpl = templates();
  const id = log.template || getState().settings.weekMap?.[parseDay(day).getDay()] || 'main';
  return tpl.some((t) => t.id === id) ? id : tpl[0]?.id;
}
export function templateFor(day) {
  const id = templateIdFor(day);
  return templates().find((t) => t.id === id) || { id: 'none', name: 'Bez šablony', blocks: [] };
}

/** "HH:MM" z editoru → minuty logického dne (00:00–03:59 patří ke stejnému dni). */
export function inputToMin(v) { const m = toMin(v); return m < 240 ? m + 1440 : m; }

/**
 * Bloky dne: šablona dne + jednorázové bloky + denní úpravy (časy, rozdělení, stav, cíl, odebrání).
 * includeRemoved: i odebrané bloky (pro plánovač).
 */
export function dayBlocks(day, { includeRemoved = false } = {}) {
  const log = daily('daylog', day);
  const st = log.blocks || {};
  const out = [];
  const base = [...templateFor(day).blocks.map((b) => ({ ...b, s: toMin(b.start), e: toMin(b.end) })),
    ...(log.extra || []).map((x) => ({ ...x, s: x.start, e: x.end, extra: true }))];
  for (const b of base) {
    let s = b.s, e = b.e;
    if (e <= s) e = s + 30;
    const parts = b.splittable && log.split?.[b.id]
      ? [{ id: b.id + 'a', s, e: s + Math.floor((e - s - 10) / 2), n: 1 }, { id: b.id + 'b', s: s + Math.ceil((e - s + 10) / 2), e, n: 2 }]
      : [{ id: b.id, s, e }];
    for (const p of parts) {
      const o = st[p.id] || {};
      if (o.removed && !includeRemoved) continue;
      out.push({
        id: p.id, baseId: b.id, title: (o.title || b.title) + (p.n ? ` · blok ${p.n}` : ''), baseTitle: o.title || b.title, type: b.type,
        splittable: !!b.splittable, split: !!log.split?.[b.id], extra: !!b.extra,
        start: o.start ?? p.s, end: o.end ?? p.e, origStart: p.s, origEnd: p.e,
        status: o.status || 'pending', goal: o.goal || '', moved: o.start != null && o.start !== p.s,
        removed: !!o.removed, deep: BLOCK_TYPES[b.type]?.deep || false,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function setBlock(day, id, p) {
  setDaily('daylog', day, (d) => ({ ...d, blocks: { ...(d.blocks || {}), [id]: { ...(d.blocks?.[id] || {}), ...p } } }));
}
/** Posun začátku zachová délku bloku. */
export function moveBlockStart(day, b, newStart) {
  const dur = b.end - b.start;
  setBlock(day, b.id, { start: newStart, end: newStart + dur });
}
export function addExtraBlock(day, { title, start, end, type }) {
  const id = 'x' + Math.random().toString(36).slice(2, 8);
  setDaily('daylog', day, (d) => ({ ...d, extra: [...(d.extra || []), { id, title, start, end, type }] }));
  return id;
}
export function removeExtraBlock(day, id) {
  setDaily('daylog', day, (d) => ({ ...d, extra: (d.extra || []).filter((x) => x.id !== id) }));
}

/** Kontrola plánu: překryvy, hluboká práce, spánek před dnem. */
export function planCheck(day) {
  const { settings } = getState();
  const blocks = dayBlocks(day);
  const overlaps = [];
  for (let i = 1; i < blocks.length; i++) if (blocks[i].start < blocks[i - 1].end) overlaps.push([blocks[i - 1], blocks[i]]);
  const deepPlanned = blocks.filter((b) => b.deep).reduce((a, b) => a + (b.end - b.start), 0);
  const wake = blocks.find((b) => b.type !== 'sleep');
  const prevSleep = dayBlocks(addDays(day, -1)).find((b) => b.type === 'sleep');
  const sleepH = wake && prevSleep ? (wake.start + 1440 - prevSleep.start) / 60 : null;
  const bed = blocks.find((b) => b.type === 'sleep');
  return { blocks, overlaps, deepPlanned, overCap: deepPlanned > settings.deepCapMin, wake: wake?.start ?? null, bed: bed?.start ?? null, sleepH, sleepShort: sleepH != null && sleepH < settings.sleepGoalH };
}

// ---------------- úkoly ----------------
/** Úkol: entry kind "task" { text, done, day (YYYY-MM-DD | null = zásobník), blockId, star, doneAt } */
export function tasksFor(day) {
  return all('task').filter((t) => t.data.day === day)
    .sort((a, b) => (a.data.done - b.data.done) || ((b.data.star ? 1 : 0) - (a.data.star ? 1 : 0)) || a.created_at.localeCompare(b.created_at));
}
export function backlog() { return all('task').filter((t) => !t.data.day && !t.data.done).sort((a, b) => ((b.data.star ? 1 : 0) - (a.data.star ? 1 : 0)) || b.created_at.localeCompare(a.created_at)); }
export function overdueTasks() { const t = today(); return all('task').filter((x) => x.data.day && x.data.day < t && !x.data.done).sort((a, b) => a.data.day.localeCompare(b.data.day)); }
export function addTask(text, day = null, extra = {}) { return add('task', { text, done: false, day, blockId: null, star: false, ...extra }); }
export function toggleTask(t) { update(t.id, { done: !t.data.done, doneAt: !t.data.done ? new Date().toISOString() : null }); }
export function moveTask(t, day) { update(t.id, { day, blockId: day === t.data.day ? t.data.blockId : null }); }

// ---------------- hluboká práce ----------------
export function deepEntries(day) { return all('deep_block').filter((r) => r.day === day); }
export function deepMin(day) { return deepEntries(day).reduce((a, r) => a + (r.data.actualMin || 0), 0); }
export function deepByDay() {
  const m = new Map();
  for (const r of all('deep_block')) m.set(r.day, (m.get(r.day) || 0) + (r.data.actualMin || 0));
  return m;
}

// ---------------- tělo, rutina, čtení ----------------
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
/** Kapitoly naplánované na den (a nepřečtené z minula). */
export function chaptersDue(day) {
  const out = [];
  for (const b of all('book')) {
    if (b.data.finished) continue;
    (b.data.chapters || []).forEach((c, i) => {
      if (!c.read && c.plan && c.plan <= day) out.push({ book: b, ch: c, i, late: c.plan < day });
    });
  }
  return out.sort((a, b) => a.ch.plan.localeCompare(b.ch.plan));
}
export function chaptersReadOn(day) {
  let n = 0;
  for (const b of all('book')) for (const c of b.data.chapters || []) if (c.read && c.readAt === day) n++;
  return n;
}

// ---------------- návyky ----------------
/** Hodnota návyku pro den: true/false, nebo číslo u "deep" (minuty). */
export function habitValue(key, day) {
  const { settings } = getState();
  switch (key) {
    case 'routine': return routineDone(day);
    case 'gym': return !!daily('body', day).gym?.done;
    case 'sauna': return !!daily('body', day).sauna?.done;
    case 'water': return (daily('body', day).waterMl || 0) >= settings.waterGoalMl;
    case 'sleep': { const h = sleepHours(daily('body', day).sleep); return h != null && h >= settings.sleepGoalH; }
    case 'journal': { const j = daily('journal', day); return !!(j.text || j.mood || j.answer || (j.gratitude || []).some(Boolean)); }
    case 'detox': return !!daily('influence', day).detox;
    case 'social': { const i = daily('influence', day); return i.socialMin != null && i.socialMin <= settings.socialLimitMin; }
    case 'shutdown': return !!daily('shutdown', day).closed;
    case 'read': return chaptersReadOn(day) > 0 || !!daily('routine', day).reading;
    case 'planned': return !!daily('daylog', addDays(day, 1)).planned;
    case 'deep': return deepMin(day);
    default: return false;
  }
}
const okv = (v) => (typeof v === 'number' ? v > 0 : v);
/** Aktuální série: dnešek se nepočítá jako přerušení, pokud ještě není splněn. */
export function streak(key) {
  let d = today(), n = 0;
  if (!okv(habitValue(key, d))) d = addDays(d, -1);
  for (let i = 0; i < 3650 && okv(habitValue(key, d)); i++) { n++; d = addDays(d, -1); }
  return n;
}
export function bestStreak(key, days = 365) {
  let best = 0, cur = 0, d = addDays(today(), -days);
  for (let i = 0; i <= days; i++) { if (okv(habitValue(key, d))) { cur++; best = Math.max(best, cur); } else cur = 0; d = addDays(d, 1); }
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
