import { useState } from 'preact/hooks';
import { html, today, addDays, fmtHours, fmtDay, weekStart, DOW_S, parseDay, pearson, pad } from './util.js';
import { Page, Card, LineChart, Bars, Chips } from './ui.js';
import { useStore, all, daily } from './store.js';
import { deepByDay, streak, bestStreak, habitValue, sleepHours, dayBlocks, tasksFor } from './logic.js';
import { HABITS, DEEP_TYPES } from './defaults.js';

function sumRange(m, from, to) { let s = 0; for (const [d, v] of m) if (d >= from && d <= to) s += v; return s; }

export function StatsPage() {
  const store = useStore();
  const t = today();
  const dm = deepByDay();
  const ws = weekStart(t);
  const ms = t.slice(0, 8) + '01';
  const ys = t.slice(0, 5) + '01-01';
  const tiles = [['Dnes', dm.get(t) || 0], ['Týden', sumRange(dm, ws, t)], ['Měsíc', sumRange(dm, ms, t)], ['Rok', sumRange(dm, ys, t)]];

  const [range, setRange] = useState('year');
  // kumulativní graf
  const from = range === 'year' ? ys : range === 'all' ? ([...dm.keys()].sort()[0] || ys) : addDays(t, -89);
  const pts = []; let acc = 0, d = from;
  for (let i = 0; i < 3700 && d <= t; i++) { acc += dm.get(d) || 0; pts.push({ x: fmtDay(d), y: acc / 60 }); d = addDays(d, 1); }
  const last30 = sumRange(dm, addDays(t, -29), t) / 30;
  const daysLeft = Math.round((new Date(+t.slice(0, 4), 11, 31) - parseDay(t)) / 864e5);
  const projection = (sumRange(dm, ys, t) + last30 * daysLeft) / 60;

  const week = Array.from({ length: 7 }, (_, i) => { const day = addDays(ws, i); return { label: DOW_S[parseDay(day).getDay()], v: (dm.get(day) || 0) / 60, hi: day === t }; });
  const weeks = Array.from({ length: 12 }, (_, i) => { const s = addDays(ws, (i - 11) * 7); return { label: s.slice(8, 10) + '.' + +s.slice(5, 7) + '.', v: sumRange(dm, s, addDays(s, 6)) / 60, hi: i === 11 }; });

  return html`<${Page} title="Statistiky">
    <div class="tiles">${tiles.map(([l, v]) => html`<div class="tile"><span class="lbl">${l}</span><b>${fmtHours(v)}</b></div>`)}</div>
    <${Card} title="Nabalovací efekt" meta="hodiny hluboké práce celkem">
      <${Chips} options=${[{ key: 'd90', label: '90 dní' }, { key: 'year', label: 'Letos' }, { key: 'all', label: 'Vše' }]} value=${range} onChange=${(v) => v && setRange(v)} />
      <${LineChart} points=${pts} fmt=${(v) => Math.round(v) + ' h'} label="Kumulativní hodiny hluboké práce" height=${170} />
      <p class="muted small">Tempem posledních 30 dní (${fmtHours(last30)} denně) budeš mít na konci roku zhruba <b>${Math.round(projection)} h</b>.</p>
    </${Card}>
    <div class="grid2">
      <${Card} title="Tento týden" meta=${`strop ${fmtHours(store.settings.deepCapMin)}/den`}>
        <${Bars} items=${week} cap=${store.settings.deepCapMin / 60} fmt=${(v) => v.toFixed(1) + ' h'} />
      </${Card}>
      <${Card} title="12 týdnů">
        <${Bars} items=${weeks} fmt=${(v) => v.toFixed(1) + ' h'} />
      </${Card}>
    </div>
    <${Card} title="Půl roku hluboké práce"><${Heatmap} dm=${dm} cap=${store.settings.deepCapMin} /></${Card}>
    <${BlockQuality} />
    <${EnergyDay} />
    <${PlanAdherence} />
    <${WeekOverview} ws=${ws} />
    <${Streaks} />
    <${Correlations} />
  </${Page}>`;
}

export function weekData(ws) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => d <= today());
  const deep = all('deep_block').filter((r) => r.day >= ws && r.day <= addDays(ws, 6));
  const q = deep.filter((r) => r.data.quality);
  const moods = days.map((d) => daily('journal', d).mood).filter(Boolean);
  const sleeps = days.map((d) => sleepHours(daily('body', d).sleep)).filter((x) => x != null);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return {
    deep: deep.reduce((a, r) => a + (r.data.actualMin || 0), 0) / 60,
    quality: avg(q.map((r) => r.data.quality)),
    interruptions: deep.reduce((a, r) => a + (r.data.interruptions || 0), 0),
    routine: days.filter((d) => habitValue('routine', d)).length,
    gym: days.filter((d) => habitValue('gym', d)).length,
    sauna: days.filter((d) => habitValue('sauna', d)).length,
    sleep: avg(sleeps),
    mood: avg(moods),
    social: days.reduce((a, d) => a + (daily('influence', d).socialMin || 0), 0),
    shutdown: days.filter((d) => habitValue('shutdown', d)).length,
    tasks: days.reduce((a, d) => a + tasksFor(d).filter((t) => t.data.done).length, 0),
    planned: days.filter((d) => daily('daylog', d).planned).length,
  };
}

function WeekOverview({ ws }) {
  const a = weekData(ws), b = weekData(addDays(ws, -7));
  const f1 = (v) => (v == null ? '–' : v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 }));
  const rows = [
    ['Hluboká práce', a.deep, b.deep, (v) => f1(v) + ' h', 1],
    ['Průměrná kvalita', a.quality, b.quality, f1, 1],
    ['Vyrušení', a.interruptions, b.interruptions, f1, -1],
    ['Ranní rutina', a.routine, b.routine, (v) => v + '×', 1],
    ['Gym', a.gym, b.gym, (v) => v + '×', 1],
    ['Sauna', a.sauna, b.sauna, (v) => v + '×', 1],
    ['Průměrný spánek', a.sleep, b.sleep, (v) => f1(v) + (v == null ? '' : ' h'), 1],
    ['Průměrná nálada', a.mood, b.mood, f1, 1],
    ['Sociální sítě', a.social, b.social, (v) => v + ' min', -1],
    ['Dny uzavřeny', a.shutdown, b.shutdown, (v) => v + '×', 1],
    ['Dny naplánované předem', a.planned, b.planned, (v) => v + '×', 1],
    ['Hotové úkoly', a.tasks, b.tasks, (v) => v + '', 1],
  ];
  return html`<${Card} title="Týdenní přehled" meta=${`od ${fmtDay(ws)}`}>
    <div class="tbl-wrap"><table class="tbl wide">
      <thead><tr><th></th><th>Tento týden</th><th>Minulý</th></tr></thead>
      <tbody>${rows.map(([l, x, y, f, dir]) => {
        const better = x != null && y != null && x !== y ? ((x - y) * dir > 0 ? 'up' : 'down') : '';
        return html`<tr><th>${l}</th><td class=${better}>${f(x)}</td><td class="muted">${f(y)}</td></tr>`;
      })}</tbody></table></div>
  </${Card}>`;
}

function Streaks() {
  const t = today();
  return html`<${Card} title="Série návyků">
    <ul class="streaks">${HABITS.filter((h) => h.key !== 'deep').concat([{ key: 'deep', label: 'Hluboká práce' }]).map((h) => {
      const s = streak(h.key);
      return html`<li><span class="grow">${h.label}</span>
        <span class="dots sm">${Array.from({ length: 14 }, (_, i) => { const d = addDays(t, i - 13); const v = habitValue(h.key, d); return html`<span class=${'d' + ((typeof v === 'number' ? v > 0 : v) ? ' on' : '')}></span>`; })}</span>
        <b class="nowrap">${s}</b><span class="muted small nowrap">max ${bestStreak(h.key)}</span></li>`;
    })}</ul>
  </${Card}>`;
}

function label(r) {
  const a = Math.abs(r);
  const s = a < 0.1 ? 'žádná souvislost' : a < 0.3 ? 'slabá' : a < 0.5 ? 'střední' : 'silná';
  if (a < 0.1) return s;
  return `${s} ${r > 0 ? 'kladná' : 'záporná'}`;
}

function Correlations() {
  const t = today();
  const days = Array.from({ length: 90 }, (_, i) => addDays(t, -i));
  const qualityOf = new Map();
  for (const r of all('deep_block')) if (r.data.quality) { const a = qualityOf.get(r.day) || []; a.push(r.data.quality); qualityOf.set(r.day, a); }
  const metrics = {
    sleep: { label: 'Spánek (h)', get: (d) => sleepHours(daily('body', d).sleep) },
    sleepQ: { label: 'Kvalita spánku', get: (d) => daily('body', d).sleep?.q ?? null },
    gym: { label: 'Gym (ano/ne)', get: (d) => (daily('body', d).gym ? (daily('body', d).gym.done ? 1 : 0) : null) },
    social: { label: 'Sociální sítě (min)', get: (d) => daily('influence', d).socialMin ?? null },
    routine: { label: 'Ranní rutina (ano/ne)', get: (d) => (Object.keys(daily('routine', d)).length ? (habitValue('routine', d) ? 1 : 0) : null) },
    planned: { label: 'Den naplánovaný předem', get: (d) => (Object.keys(daily('daylog', d)).length ? (daily('daylog', d).planned ? 1 : 0) : null) },
  };
  const outcomes = {
    focus: { label: 'kvalita soustředění', get: (d) => { const a = qualityOf.get(d); return a ? a.reduce((x, y) => x + y, 0) / a.length : null; } },
    mood: { label: 'nálada', get: (d) => daily('journal', d).mood ?? null },
  };
  const rows = [];
  for (const [mk, m] of Object.entries(metrics)) for (const [ok, o] of Object.entries(outcomes)) {
    const xs = [], ys = [];
    for (const d of days) { const x = m.get(d), y = o.get(d); if (x != null && y != null) { xs.push(x); ys.push(y); } }
    rows.push({ k: mk + ok, a: m.label, b: o.label, n: xs.length, r: xs.length >= 5 ? pearson(xs, ys) : null });
  }
  return html`<${Card} title="Souvislosti" meta="posledních 90 dní">
    <p class="muted small">Pearsonova korelace mezi dny. Ukazuje souvislost, ne příčinu. Spolehlivější je od ~20 dní dat.</p>
    <ul class="corr">${rows.map((x) => html`<li>
      <span class="grow">${x.a} → ${x.b}</span>
      ${x.r == null ? html`<span class="muted small">málo dat (${x.n})</span>` : html`
        <span class="corr-bar" aria-hidden="true"><i class=${x.r < 0 ? 'neg' : 'pos'} style=${`width:${Math.abs(x.r) * 50}%;${x.r < 0 ? 'right:50%' : 'left:50%'}`}></i></span>
        <span class="small nowrap">${label(x.r)} <span class="muted">r=${x.r.toFixed(2)}, n=${x.n}</span></span>`}
    </li>`)}</ul>
  </${Card}>`;
}

function Heatmap({ dm, cap }) {
  const t = today();
  const weeks = 26;
  const start = addDays(weekStart(t), -(weeks - 1) * 7);
  const lvl = (m) => (!m ? 0 : m < cap * 0.25 ? 1 : m < cap * 0.5 ? 2 : m < cap * 0.85 ? 3 : 4);
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
  const total = [...dm.entries()].filter(([d]) => d >= start && d <= t).reduce((a, [, v]) => a + v, 0);
  const active = [...dm.entries()].filter(([d, v]) => d >= start && d <= t && v > 0).length;
  return html`<div class="heat-wrap"><div class="heat" role="img" aria-label="Kalendář hluboké práce za 26 týdnů">
    ${cols.map((c) => html`<div class="heat-col">${c.map((d) => html`<span class=${'h' + (d > t ? ' f' : ' l' + lvl(dm.get(d) || 0)) + (d === t ? ' t' : '')} title=${`${fmtDay(d)}: ${fmtHours(dm.get(d) || 0)}`}></span>`)}</div>`)}
  </div></div>
  <p class="muted small">${active} dní s hlubokou prací · ${fmtHours(total)} celkem. Sytější = blíž dennímu stropu.</p>`;
}

function BlockQuality() {
  const t = today();
  const from = addDays(t, -29);
  const rows = all('deep_block').filter((r) => r.day >= from);
  if (!rows.length) return null;
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const f1 = (v) => (v == null ? '–' : v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 }));
  const byType = DEEP_TYPES.map((d) => { const r = rows.filter((x) => x.data.type === d.key); return { l: d.label, min: r.reduce((a, x) => a + (x.data.actualMin || 0), 0), q: avg(r.map((x) => x.data.quality).filter(Boolean)), n: r.length }; });
  const slot = (r) => { const h = new Date(r.data.startedAt || 0).getHours(); return h < 12 ? 0 : h < 17 ? 1 : 2; };
  const bySlot = ['Dopoledne', 'Odpoledne', 'Večer'].map((l, i) => { const r = rows.filter((x) => x.data.startedAt && slot(x) === i); return { l, q: avg(r.map((x) => x.data.quality).filter(Boolean)), n: r.length }; });
  const met = rows.filter((r) => r.data.goalMet);
  const metRate = met.length ? met.filter((r) => r.data.goalMet === 'yes').length / met.length : null;
  const best = bySlot.filter((x) => x.q != null && x.n >= 2).sort((a, b) => b.q - a.q)[0];
  return html`<${Card} title="Kvalita bloků" meta="30 dní">
    <div class="tbl-wrap"><table class="tbl wide"><thead><tr><th></th><th>Hodiny</th><th>Bloků</th><th>⌀ kvalita</th></tr></thead>
      <tbody>${byType.map((x) => html`<tr><th>${x.l}</th><td>${fmtHours(x.min)}</td><td>${x.n}</td><td>${f1(x.q)}</td></tr>`)}</tbody></table></div>
    <div class="tbl-wrap"><table class="tbl wide"><thead><tr><th>Denní doba</th><th>Bloků</th><th>⌀ kvalita</th></tr></thead>
      <tbody>${bySlot.map((x) => html`<tr><th>${x.l}</th><td>${x.n}</td><td>${f1(x.q)}</td></tr>`)}</tbody></table></div>
    <p class="muted small">${best ? `Nejlépe se soustředíš ${best.l.toLowerCase()}. ` : ''}${metRate != null ? `Cíl bloku splněn v ${Math.round(metRate * 100)} % bloků.` : ''} ⌀ vyrušení na blok ${f1(avg(rows.map((r) => r.data.interruptions || 0)))}.</p>
  </${Card}>`;
}

function PlanAdherence() {
  const t = today();
  const days = Array.from({ length: 14 }, (_, i) => addDays(t, -i - 1)).reverse();
  const items = days.map((d) => {
    const bl = dayBlocks(d).filter((b) => b.type !== 'sleep');
    const done = bl.filter((b) => b.status === 'done').length;
    return { label: DOW_S[parseDay(d).getDay()], v: bl.length ? Math.round((done / bl.length) * 100) : 0, hi: !!daily('daylog', d).planned, any: Object.keys(daily('daylog', d)).length > 0 };
  });
  if (!items.some((x) => x.any)) return null;
  const used = items.filter((x) => x.any);
  const avg = Math.round(used.reduce((a, x) => a + x.v, 0) / used.length);
  return html`<${Card} title="Dodržení plánu" meta="14 dní · % hotových bloků">
    <${Bars} items=${items} max=${100} fmt=${(v) => v + ' %'} height=${90} />
    <p class="muted small">Průměr ${avg} %. Zvýrazněné dny byly naplánované večer předem.</p>
  </${Card}>`;
}

function EnergyDay() {
  const t = today();
  const logs = [];
  for (let i = 0; i < 30; i++) for (const e of daily('journal', addDays(t, -i)).energyLog || []) logs.push(e);
  if (logs.length < 3) return html`<${Card} title="Energie během dne"><p class="muted small">Zapisuj energii 3× denně (karta na stránce Dnes nebo tlačítko +). Po pár dnech tu uvidíš, kdy máš nejvíc sil.</p></${Card}>`;
  const buckets = Array.from({ length: 8 }, (_, i) => 8 * 60 + i * 120);
  const items = buckets.map((b) => { const v = logs.filter((e) => (e.t % 1440) >= b && (e.t % 1440) < b + 120 || (b === 22 * 60 && e.t >= 1440)).map((e) => e.v); return { label: String(b / 60), v: v.length ? v.reduce((a, c) => a + c, 0) / v.length : 0, n: v.length }; });
  const best = [...items].filter((x) => x.n).sort((a, b) => b.v - a.v)[0];
  return html`<${Card} title="Energie během dne" meta=${`30 dní · ${logs.length} zápisů`}>
    <${Bars} items=${items.map((x) => ({ ...x, hi: x === best }))} max=${5} fmt=${(v) => v.toFixed(1)} height=${90} />
    ${best && html`<p class="muted small">Nejvíc energie máš kolem ${best.label}–${+best.label + 2} h (⌀ ${best.v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}). Sem patří nejtěžší hluboká práce.</p>`}
  </${Card}>`;
}
