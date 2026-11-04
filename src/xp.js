// Motivace: body (XP) za den, levely a odznaky. Počítá se z toho, co už zapisuješ, nic navíc.
import { daily, all, getState, dataVersion } from './store.js';
import { today, addDays, dayKey } from './util.js';
import { dayBlocks, deepMin, routineDone, sleepHours, bestStreak, streak, habitValue, chaptersReadOn } from './logic.js';

export const DAY_GOAL = 80;

/** Body za den s rozpisem. */
export function dayXP(day) {
  const s = getState().settings;
  const items = [];
  const addI = (label, xp, group) => { if (xp) items.push({ label, xp, group }); };
  const r = daily('routine', day);
  const rn = s.routine.filter((it) => r[it.key]).length;
  addI(`Rutina ${rn}/${s.routine.length}`, rn * 2, 'rutina');
  if (routineDone(day)) addI('Celá rutina', 10, 'rutina');
  const dm = Math.min(deepMin(day), s.deepCapMin);
  addI(`Hluboká práce ${Math.round(dm / 6) / 10} h`, Math.round(dm / 6), 'prace');
  const good = all('deep_block').filter((b) => b.day === day && b.data.quality >= 4).length;
  addI(`Kvalitní bloky ×${good}`, good * 5, 'prace');
  const log = daily('daylog', day);
  if (log.mainTask && log.mainDone) addI('Hlavní úkol', 15, 'prace');
  const tasks = all('task').filter((t) => t.data.done && (t.data.doneAt ? dayKey(new Date(t.data.doneAt)) === day : t.data.day === day)).length;
  addI(`Úkoly ×${tasks}`, tasks * 3, 'prace');
  const blocksDone = dayBlocks(day).filter((b) => b.status === 'done' && !b.deep).length;
  addI(`Bloky ×${blocksDone}`, blocksDone * 2, 'prace');
  const b = daily('body', day);
  if ((b.waterMl || 0) >= s.waterGoalMl) addI('Pitný režim', 5, 'telo');
  if (b.gym?.done) addI('Gym', 15, 'telo');
  if (b.sauna?.done) addI('Sauna', 5, 'telo');
  const sh = sleepHours(b.sleep);
  if (sh != null && sh >= s.sleepGoalH) addI('Spánek podle cíle', 5, 'telo');
  const j = daily('journal', day);
  if (j.text || j.answer || (j.gratitude || []).some(Boolean)) addI('Deník', 5, 'mysl');
  const en = (j.energyLog || []).length;
  addI(`Energie ×${en}`, en, 'mysl');
  if (chaptersReadOn(day)) addI('Kapitola', 5, 'mysl');
  const will = all('will').filter((w) => w.day === day);
  const plus = will.filter((w) => w.data.v > 0).length, minus = will.length - plus;
  addI(`+1 ×${plus}`, plus * 5, 'vule');
  addI(`−1 ×${minus}`, -minus * 2, 'vule');
  const inf = daily('influence', day);
  if (inf.detox) addI('Detox den', 10, 'vule');
  else if (inf.socialMin != null && inf.socialMin <= s.socialLimitMin) addI('Sítě pod limitem', 5, 'vule');
  if (daily('shutdown', day).closed) addI('Den uzavřen', 10, 'vecer');
  if (daily('daylog', addDays(day, 1)).planned) addI('Zítřek naplánován', 10, 'vecer');
  return { total: items.reduce((a, x) => a + x.xp, 0), items };
}

/** Level z celkových bodů: každý další level potřebuje o 50 bodů víc. */
export function levelOf(total) {
  let lvl = 1, need = 200, rest = Math.max(0, total);
  while (rest >= need) { rest -= need; lvl++; need = 200 + (lvl - 1) * 50; }
  return { lvl, into: rest, need, pct: rest / need };
}

let cache = { key: '', v: null };
/** Souhrn: celkové body, level, body po dnech (posledních 400 dní). */
export function xpSummary() {
  const st = getState();
  const key = dataVersion() + '|' + today() + '|' + st.rows.size;
  if (cache.key === key) return cache.v;
  const t = today();
  const byDay = new Map();
  let total = 0, best = { day: null, xp: 0 }, goalDays = 0;
  for (let i = 0; i < 400; i++) {
    const d = addDays(t, -i);
    const x = dayXP(d).total;
    if (x) byDay.set(d, x);
    total += x;
    if (x > best.xp) best = { day: d, xp: x };
    if (x >= DAY_GOAL) goalDays++;
  }
  // série dní se splněným denním cílem (dnešek ještě nepřerušuje)
  let s = 0, d = t;
  if ((byDay.get(d) || 0) < DAY_GOAL) d = addDays(d, -1);
  while ((byDay.get(d) || 0) >= DAY_GOAL && s < 400) { s++; d = addDays(d, -1); }
  const v = { total, byDay, best, goalDays, goalStreak: s, level: levelOf(total) };
  cache = { key, v };
  return v;
}

function count(fn, days = 400) { let n = 0; for (let i = 0; i < days; i++) if (fn(addDays(today(), -i))) n++; return n; }

/** Odznaky s pokrokem. */
export function achievements() {
  const sum = xpSummary();
  const deepH = all('deep_block').reduce((a, b) => a + (b.data.actualMin || 0), 0) / 60;
  const plusN = all('will').filter((w) => w.data.v > 0).length;
  const list = [
    { id: 'start', icon: '◎', title: 'První krok', desc: 'Získej prvních 50 bodů za den', cur: sum.best.xp, goal: 50 },
    { id: 'goal7', icon: '★', title: 'Týden v cíli', desc: '7 dní v řadě denní cíl bodů', cur: Math.max(sum.goalStreak, bestRun((d) => (sum.byDay.get(d) || 0) >= DAY_GOAL)), goal: 7 },
    { id: 'routine7', icon: '☀', title: 'Ranní ptáče', desc: 'Celá rutina 7 dní v řadě', cur: bestStreak('routine'), goal: 7 },
    { id: 'routine30', icon: '☀', title: 'Rutina měsíc', desc: 'Celá rutina 30 dní v řadě', cur: bestStreak('routine'), goal: 30 },
    { id: 'deep10', icon: '◆', title: 'Hloubka', desc: '10 h hluboké práce', cur: deepH, goal: 10 },
    { id: 'deep100', icon: '◆', title: 'Sto hodin', desc: '100 h hluboké práce', cur: deepH, goal: 100 },
    { id: 'flow', icon: '≈', title: 'Flow', desc: 'Blok s kvalitou 5', cur: all('deep_block').some((b) => b.data.quality === 5) ? 1 : 0, goal: 1 },
    { id: 'will10', icon: '+', title: 'Silná vůle', desc: '10× +1', cur: plusN, goal: 10 },
    { id: 'will50', icon: '+', title: 'Ocelová vůle', desc: '50× +1', cur: plusN, goal: 50 },
    { id: 'gym10', icon: '▲', title: 'Železo', desc: '10 tréninků', cur: count((d) => habitValue('gym', d)), goal: 10 },
    { id: 'water7', icon: '◌', title: 'Hydratace', desc: 'Cíl vody 7 dní v řadě', cur: bestStreak('water'), goal: 7 },
    { id: 'plan7', icon: '▦', title: 'Plánovač', desc: '7 dní naplánovaných večer předem', cur: count((d) => daily('daylog', d).planned), goal: 7 },
    { id: 'close5', icon: '☾', title: 'Uzavřeno', desc: '5× večerní rituál', cur: count((d) => daily('shutdown', d).closed), goal: 5 },
    { id: 'lvl5', icon: '⬢', title: 'Level 5', desc: 'Dosáhni levelu 5', cur: sum.level.lvl, goal: 5 },
    { id: 'lvl10', icon: '⬢', title: 'Level 10', desc: 'Dosáhni levelu 10', cur: sum.level.lvl, goal: 10 },
  ];
  return list.map((a) => ({ ...a, cur: Math.min(a.cur, a.goal), done: a.cur >= a.goal }));
}

function bestRun(fn, days = 400) {
  let best = 0, cur = 0;
  for (let i = days; i >= 0; i--) { if (fn(addDays(today(), -i))) { cur++; best = Math.max(best, cur); } else cur = 0; }
  return best;
}
