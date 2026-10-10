// Návrh plánu: pravidla nad tvými daty (bez AI). Každý návrh má text a případně akci na jedno klepnutí.
import { html, today, addDays, fmtDur, fromMin, weekStart, vibrate } from './util.js';
import { daily, setDaily, getState, setSettings, all, update } from './store.js';
import { planCheck, tasksFor, setBlock, sleepHours, templates } from './logic.js';
import { ENERGY_SLOTS } from './push.js';

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const f1 = (v) => v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });

/** Rozdělí úkoly bez bloku: důležité do hlubokých bloků, ostatní do mělké práce. */
export function distributeTasks(day, blocks) {
  const tasks = tasksFor(day).filter((t) => !t.data.done && !t.data.blockId);
  const deep = blocks.filter((b) => b.deep && b.status === 'pending');
  const shallow = blocks.filter((b) => b.type === 'shallow' && b.status === 'pending');
  const load = new Map(blocks.map((b) => [b.id, tasksFor(day).filter((t) => t.data.blockId === b.id && !t.data.done).length]));
  const pick = (list, cap) => { const b = list.find((x) => (load.get(x.id) || 0) < cap); if (b) load.set(b.id, (load.get(b.id) || 0) + 1); return b; };
  let n = 0;
  for (const t of [...tasks.filter((x) => x.data.star), ...tasks.filter((x) => !x.data.star)]) {
    const b = t.data.star ? pick(deep, 2) || pick(shallow, 4) : pick(shallow, 4) || pick(deep, 3);
    if (b) { update(t.id, { blockId: b.id }); n++; }
  }
  return n;
}

export function suggestionsFor(day) {
  const { settings } = getState();
  const chk = planCheck(day);
  const log = daily('daylog', day);
  const tasks = tasksFor(day);
  const open = tasks.filter((t) => !t.data.done);
  const out = [];

  const review = all('review').filter((r) => r.day <= weekStart(day) && r.data.focus).sort((a, b) => b.day.localeCompare(a.day))[0];
  if (review && review.day >= addDays(weekStart(day), -7)) out.push({ text: `Zaměření týdne: „${review.data.focus}“` });

  const unassigned = open.filter((t) => !t.data.blockId);
  if (unassigned.length && chk.blocks.some((b) => b.deep || b.type === 'shallow'))
    out.push({ text: `${unassigned.length} ${unassigned.length === 1 ? 'úkol nemá' : 'úkolů nemá'} blok.`, label: 'Rozdělit do bloků', fn: () => distributeTasks(day, chk.blocks) });

  const starred = open.find((t) => t.data.star);
  if (!log.mainTask && starred) out.push({ text: `Hlavní úkol dne zatím chybí. Nejdůležitější úkol je „${starred.data.text}“.`, label: 'Nastavit', fn: () => setDaily('daylog', day, { mainTask: starred.data.text }) });
  if (open.length > 7) out.push({ text: `Na den máš ${open.length} úkolů. Realisticky stihneš 3–5 větších věcí.` });

  // strop hluboké práce
  if (chk.overCap) {
    const over = chk.deepPlanned - settings.deepCapMin;
    const last = [...chk.blocks].reverse().find((b) => b.deep && b.status === 'pending' && b.end - b.start - over >= 20);
    const s = { text: `Plán má ${fmtDur(chk.deepPlanned)} hluboké práce, strop je ${fmtDur(settings.deepCapMin)}.`, actions: [] };
    if (last) s.actions.push({ label: `Zkrátit ${last.title} o ${fmtDur(over)}`, fn: () => setBlock(day, last.id, { end: last.end - over }) });
    s.actions.push({ label: `Zvednout strop na ${f1(Math.ceil(chk.deepPlanned / 30) / 2)} h`, fn: () => setSettings({ deepCapMin: Math.ceil(chk.deepPlanned / 30) * 30 }) });
    out.push(s);
  }

  const noGoal = chk.blocks.filter((b) => b.deep && !b.goal);
  if (noGoal.length) out.push({ text: `${noGoal.length} ${noGoal.length === 1 ? 'hluboký blok nemá' : 'hluboké bloky nemají'} cíl. Napiš u každého, co bude na konci hotové.` });

  // spánek
  const sleeps = [0, 1, 2].map((i) => sleepHours(daily('body', addDays(today(), -i)).sleep)).filter((x) => x != null);
  const sl = avg(sleeps);
  const light = templates().find((t) => t.id === 'light');
  if (sl != null && sl < settings.sleepGoalH - 0.5 && sleeps.length >= 2)
    out.push({ text: `Poslední noci spíš ⌀ ${f1(sl)} h (cíl ${settings.sleepGoalH} h). Zvaž lehčí den nebo dřívější spánek.`, ...(light && log.template !== 'light' ? { label: 'Lehký den', fn: () => setDaily('daylog', day, { template: 'light' }) } : {}) });
  if (chk.sleepShort) out.push({ text: `Mezi spánkem a začátkem dne je jen ${f1(chk.sleepH)} h.` });

  // kvalita večerních bloků
  const from = addDays(today(), -21);
  const rows = all('deep_block').filter((r) => r.day >= from && r.data.quality && r.data.startedAt);
  const eve = rows.filter((r) => new Date(r.data.startedAt).getHours() >= 19), dayR = rows.filter((r) => new Date(r.data.startedAt).getHours() < 19);
  const qe = avg(eve.map((r) => r.data.quality)), qd = avg(dayR.map((r) => r.data.quality));
  if (eve.length >= 3 && dayR.length >= 3 && qe < qd - 0.5) {
    const lastEve = [...chk.blocks].reverse().find((b) => b.deep && b.start >= 19 * 60 && b.status === 'pending');
    out.push({ text: `Večerní bloky mají ⌀ kvalitu ${f1(qe)}, přes den ${f1(qd)}.`, ...(lastEve ? { label: `Vynechat ${lastEve.title} ${fromMin(lastEve.start)}`, fn: () => setBlock(day, lastEve.id, { removed: true }) } : {}) });
  }

  // energie podle denní doby
  const logs = [];
  for (let i = 1; i <= 21; i++) for (const e of daily('journal', addDays(today(), -i)).energyLog || []) logs.push(e);
  if (logs.length >= 6) {
    const bySlot = ENERGY_SLOTS.map((s) => ({ ...s, v: avg(logs.filter((e) => e.t >= s.from && e.t < s.to).map((e) => e.v)) })).filter((s) => s.v != null);
    const best = [...bySlot].sort((a, b) => b.v - a.v)[0];
    const worst = [...bySlot].sort((a, b) => a.v - b.v)[0];
    if (best && worst && best.v - worst.v >= 0.7) out.push({ text: `Nejvíc energie máš ${best.label} (⌀ ${f1(best.v)}), nejmíň ${worst.label} (⌀ ${f1(worst.v)}). Nejtěžší práci dej ${best.label}.` });
  }
  return out;
}

export function Suggestions({ day }) {
  const list = suggestionsFor(day);
  if (!list.length) return null;
  return html`<div class="card suggest">
    <div class="card-h"><h2>Návrh plánu</h2><span class="meta">podle tvých dat</span></div>
    <ul class="rows col">${list.map((s) => html`<li class="sg">
      <span>${s.text}</span>
      ${(s.fn || s.actions) && html`<div class="row wrap">
        ${s.fn && html`<button class="btn sm" onClick=${() => { vibrate(); s.fn(); }}>${s.label}</button>`}
        ${(s.actions || []).map((a) => html`<button class="btn sm" onClick=${() => { vibrate(); a.fn(); }}>${a.label}</button>`)}
      </div>`}
    </li>`)}</ul>
  </div>`;
}
